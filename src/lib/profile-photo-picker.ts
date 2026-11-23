import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

// Choisir une photo de profil, comme dans les autres apps : prendre une photo, ou en choisir
// une dans la galerie. Recadrage carré par le système, puis réduction à 512 px en JPEG
// (environ 100 Ko). Réencoder l'image efface ses métadonnées, dont la position GPS.

export type PhotoSource = "camera" | "library";

export type PickedPhoto =
  | { kind: "picked"; bytes: Uint8Array }
  | { kind: "canceled" }
  // Appareil photo refusé : seuls les réglages du téléphone peuvent le rouvrir.
  | { kind: "denied" };

const PHOTO_SIZE = 512;
const JPEG_QUALITY = 0.8;

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export async function pickProfilePhoto(source: PhotoSource): Promise<PickedPhoto> {
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
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
  const context = ImageManipulator.manipulate(asset.uri, { maxWidth: PHOTO_SIZE * 2 });
  context.resize({ width: PHOTO_SIZE, height: PHOTO_SIZE });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({
    format: SaveFormat.JPEG,
    compress: JPEG_QUALITY,
    base64: true,
  });
  if (!saved.base64) throw new Error("Photo non encodée.");
  return { kind: "picked", bytes: base64ToBytes(saved.base64) };
}
