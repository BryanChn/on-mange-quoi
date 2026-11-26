import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

// Choisir une photo, comme dans les autres apps : prendre une photo, ou en choisir une dans la
// galerie. Recadrage par le système, puis réduction en JPEG : profil carré de 512 px (environ
// 100 Ko), plat en 4:3 de 1200 × 900 px (environ 200 Ko, sous la limite de 1 Mo du stockage).
// Réencoder l'image efface ses métadonnées, dont la position GPS.

export type PhotoSource = "camera" | "library";

export type PickedPhoto =
  // uri : le fichier réduit sur le téléphone, pour l'aperçu avant l'envoi.
  | { kind: "picked"; bytes: Uint8Array; uri: string }
  | { kind: "canceled" }
  // Appareil photo refusé : seuls les réglages du téléphone peuvent le rouvrir.
  | { kind: "denied" };

type PhotoFormat = { width: number; height: number; quality: number };

const PROFILE_FORMAT: PhotoFormat = { width: 512, height: 512, quality: 0.8 };
const RECIPE_FORMAT: PhotoFormat = { width: 1200, height: 900, quality: 0.75 };

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function pickProfilePhoto(source: PhotoSource): Promise<PickedPhoto> {
  return pickPhoto(source, PROFILE_FORMAT);
}

export function pickRecipePhoto(source: PhotoSource): Promise<PickedPhoto> {
  return pickPhoto(source, RECIPE_FORMAT);
}

async function pickPhoto(source: PhotoSource, format: PhotoFormat): Promise<PickedPhoto> {
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [format.width, format.height],
    quality: 1,
  };

  let result: ImagePicker.ImagePickerResult;
  if (source === "camera") {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return { kind: "denied" };
    result = await ImagePicker.launchCameraAsync(options);
  } else {
    // Sur Android 13+, le sélecteur de photos du système : aucune permission à demander.
    result = await ImagePicker.launchImageLibraryAsync(options);
  }

  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return { kind: "canceled" };

  // Décodée directement à la bonne taille : une photo de 12 Mpx n'est jamais chargée entière.
  const context = ImageManipulator.manipulate(asset.uri, { maxWidth: format.width * 2 });
  context.resize({ width: format.width, height: format.height });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({
    format: SaveFormat.JPEG,
    compress: format.quality,
    base64: true,
  });
  if (!saved.base64) throw new Error("Photo non encodée.");
  return { kind: "picked", bytes: base64ToBytes(saved.base64), uri: saved.uri };
}
