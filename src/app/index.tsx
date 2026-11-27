import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Avatar } from "@/components/avatar";
import { GroupPills } from "@/components/group-pills";
import { ListCard, ListRow } from "@/components/list";
import { MealCard } from "@/components/meal-card";
import { PeekCarousel, type PeekCarouselHandle } from "@/components/peek-carousel";
import { PrimaryButton } from "@/components/primary-button";
import { Section } from "@/components/section";
import { StatusBarBackdrop } from "@/components/status-bar-backdrop";
import { ErrorScreen, LoadingScreen } from "@/components/status-screens";
import { TextButton } from "@/components/text-button";
import { TonightCard } from "@/components/tonight-card";
import { UpdateBanner } from "@/components/update-banner";
import { fetchHome, subscribeToHome, type Home } from "@/lib/home";
import { mealWhenLabel, sortMealsByDate, toDay } from "@/lib/meal-date";
import {
  classifyError,
  errorMessage,
  failureMessage,
  withRetry,
  type ErrorKind,
} from "@/lib/network-errors";
import { useProfile } from "@/lib/profile";
import { recipesSubtitle } from "@/lib/recipe-rules";
import {
  defaultMoment,
  featuredGroupIndex,
  groupStatus,
  groupTonight,
  memberNamesLine,
  momentLabel,
  toBuyLabel,
  type HomeGroup,
  type MealMoment,
} from "@/lib/tonight";
import { startSession } from "@/lib/votes";
import { useTheme, type Theme } from "@/theme";

// Ce qui dépasse de la carte suivante : assez pour deviner qu'on peut faire glisser.
const PEEK = 32;
// Largeur d'une carte de repas quand il y en a plusieurs, en part de la largeur utile.
const MEAL_CARD_RATIO = 0.72;

// loadedAt : « aujourd'hui » au moment du chargement. Lire l'horloge pendant le rendu le
// rendrait impur ; la date voyage donc avec les données.
type LoadedHome = Home & { loadedAt: Date };

type Styles = ReturnType<typeof createStyles>;

export default function Index() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { profile } = useProfile();
  const [home, setHome] = useState<LoadedHome | null>(null);
  // Pourquoi le dernier chargement a échoué ; null : pas d'échec.
  const [errorKind, setErrorKind] = useState<ErrorKind | null>(null);
  // Le groupe affiché (pastille, carte et outils). Posé au premier chargement sur celui où il
  // se passe quelque chose, puis seulement par l'utilisateur : un rechargement ne le change pas.
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  // Le groupe dont le vote est en train de démarrer, et l'erreur d'un lancement raté.
  const [startingGroupId, setStartingGroupId] = useState<string | null>(null);
  const [startError, setStartError] = useState<{ groupId: string; message: string } | null>(null);
  // Midi ou soir touché par l'utilisateur ; null : la présélection selon l'heure du chargement.
  const [chosenMoment, setChosenMoment] = useState<MealMoment | null>(null);
  const carouselRef = useRef<PeekCarouselHandle>(null);

  // Numéro du dernier chargement lancé : seule sa réponse a le droit de modifier l'écran
  // (le temps réel peut en lancer plusieurs coup sur coup).
  const latestRequestRef = useRef(0);

  const loadHome = useCallback(() => {
    latestRequestRef.current += 1;
    const requestId = latestRequestRef.current;

    // Une coupure courte est réessayée en silence (1 s, 2 s, 4 s) avant d'afficher l'erreur.
    withRetry(fetchHome).then(
      (loadedHome) => {
        if (latestRequestRef.current !== requestId) return;
        const loadedAt = new Date();
        setHome({ ...loadedHome, loadedAt });
        setSelectedGroupId(
          (current) =>
            current ??
            loadedHome.groups[featuredGroupIndex(loadedHome.groups, loadedHome.userId, loadedAt)]
              ?.id ??
            null,
        );
        setErrorKind(null);
      },
      (error: unknown) => {
        if (latestRequestRef.current !== requestId) return;
        setErrorKind(classifyError(error));
      },
    );
  }, []);

  // À chaque retour sur l'écran : recharger (un groupe créé, un vote clôturé ailleurs),
  // puis suivre les votes en direct. Le désabonnement se fait en quittant l'écran.
  useFocusEffect(
    useCallback(() => {
      loadHome();
      return subscribeToHome(loadHome);
    }, [loadHome]),
  );

  function retry() {
    setErrorKind(null);
    loadHome();
  }

  // Sans choix, l'heure du dernier chargement décide (pas l'horloge lue au rendu).
  const moment: MealMoment = chosenMoment ?? (home ? defaultMoment(home.loadedAt) : "soir");

  async function handleStart(group: HomeGroup) {
    setStartError(null);
    setStartingGroupId(group.id);

    try {
      const sessionId = await startSession(group.id, moment);
      router.push({ pathname: "/session/[id]", params: { id: sessionId } });
      setChosenMoment(null);
    } catch (error) {
      setStartError({
        groupId: group.id,
        message: failureMessage("Le vote n’a pas démarré", error),
      });
    } finally {
      setStartingGroupId(null);
    }
  }

  // Un rechargement raté alors que l'écran est déjà affiché ne le remplace pas par une
  // erreur : on garde les dernières données, le prochain changement réessaiera.
  if (!home) {
    return errorKind ? (
      <ErrorScreen
        title="On n’arrive pas à charger l’accueil"
        message={errorMessage(errorKind)}
        onRetry={retry}
        canSignOut
      />
    ) : (
      <LoadingScreen />
    );
  }

  const { groups, userId, loadedAt } = home;
  const displayName = profile?.display_name ?? "";
  const hasGroups = groups.length > 0;
  // Un groupe quitté ou supprimé ailleurs : on revient au premier.
  const selectedIndex = Math.max(
    0,
    groups.findIndex((group) => group.id === selectedGroupId),
  );
  const selectedGroup = groups.at(selectedIndex);
  const edge = theme.spacing.lg;
  const contentWidth = width - edge * 2;
  const meals = sortMealsByDate(home.soirees);
  const today = toDay(loadedAt);

  function selectGroup(groupId: string) {
    setSelectedGroupId(groupId);
    carouselRef.current?.scrollToIndex(groups.findIndex((group) => group.id === groupId));
  }

  const mealsSection =
    meals.length > 0 ? (
      <Section title="Bientôt">
        <PeekCarousel
          accessibilityLabel="Repas à venir"
          edgeInset={edge}
          gap={theme.spacing.md}
          itemWidth={meals.length > 1 ? Math.round(contentWidth * MEAL_CARD_RATIO) : contentWidth}
          items={meals.map((soiree, index) => ({
            key: soiree.id,
            content: (
              <MealCard
                soiree={soiree}
                when={mealWhenLabel(soiree.mealDate, today)}
                isNext={index === 0 && meals.length > 1}
              />
            ),
          }))}
        />
      </Section>
    ) : null;

  return (
    <>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[
          styles.content,
          {
            paddingHorizontal: edge,
            paddingTop: insets.top + theme.spacing.lg,
            paddingBottom: insets.bottom + theme.spacing.xl,
          },
          !hasGroups && styles.contentEmpty,
        ]}
      >
        {/* Le prénom en tomate, à côté de ton avatar : l'app s'adresse à toi. La question
            dessous prend toute la largeur, sur une seule ligne le plus souvent. */}
        <View style={styles.greeting}>
          <View style={styles.header}>
            <Text style={[styles.title, styles.titleName]} numberOfLines={1}>
              Salut {displayName}
              {hasGroups ? <Text style={styles.titleText}>,</Text> : null}
            </Text>
            <Pressable
              onPress={() => router.push("/account")}
              accessibilityRole="button"
              accessibilityLabel="Mon compte"
              hitSlop={8}
              style={({ pressed }) => pressed && styles.pressed}
            >
              <Avatar
                name={displayName}
                avatar={profile?.avatar}
                photoPath={profile?.photo_path}
                size={40}
              />
            </Pressable>
          </View>
          {hasGroups ? (
            <Text style={styles.title} accessibilityRole="header">
              on mange quoi {momentLabel(defaultMoment(loadedAt))}
              {"\u202F"}?
            </Text>
          ) : null}
        </View>

        <UpdateBanner />

        {hasGroups && selectedGroup ? (
          <>
            <View style={styles.tonight}>
              {groups.length > 1 ? (
                <GroupPills
                  groups={groups.map((group) => ({
                    id: group.id,
                    name: group.name,
                    status: groupStatus(group, loadedAt),
                  }))}
                  selectedId={selectedGroup.id}
                  onSelect={selectGroup}
                  edgeInset={edge}
                />
              ) : null}
              <PeekCarousel
                ref={carouselRef}
                accessibilityLabel="Ce soir, dans tes groupes"
                edgeInset={edge}
                gap={theme.spacing.md}
                itemWidth={groups.length > 1 ? contentWidth - PEEK : contentWidth}
                initialIndex={selectedIndex}
                onIndexChange={(index) => setSelectedGroupId(groups[index].id)}
                items={groups.map((group) => ({
                  key: group.id,
                  content: (
                    <TonightCard
                      tonight={groupTonight(group, userId, loadedAt)}
                      group={group}
                      userId={userId}
                      now={loadedAt}
                      isStarting={startingGroupId === group.id}
                      error={startError?.groupId === group.id ? startError.message : null}
                      moment={moment}
                      onMomentChange={setChosenMoment}
                      onStart={handleStart}
                    />
                  ),
                }))}
              />
            </View>

            {mealsSection}

            <GroupTools group={selectedGroup} home={home} />

            <ListCard>
              <ListRow
                icon="plus"
                label="Organiser un repas"
                subtitle="Commande, resto, ou chez quelqu’un"
                hasChevron
                onPress={() => router.push("/soiree/new")}
              />
            </ListCard>

            <View style={styles.links}>
              <TextButton label="Créer un groupe" onPress={() => router.push("/create-group")} />
              <TextButton
                label="Rejoindre avec un code"
                onPress={() => router.push("/join-group")}
              />
            </View>
          </>
        ) : (
          <>
            {mealsSection}
            <EmptyHome styles={styles} />
          </>
        )}
      </ScrollView>
      <StatusBarBackdrop />
    </>
  );
}

// Les outils du groupe affiché : ils suivent la pastille et la carte choisies.
function GroupTools({ group, home }: { group: HomeGroup; home: LoadedHome }) {
  return (
    <Section title={group.name}>
      <ListCard>
        <ListRow
          icon="shopping-cart"
          label="Liste de courses"
          subtitle={toBuyLabel(home.toBuyByGroup.get(group.id) ?? 0)}
          hasChevron
          onPress={() =>
            router.push({ pathname: "/courses/[groupId]", params: { groupId: group.id } })
          }
        />
        <ListRow
          icon="book-open"
          label="Recettes"
          subtitle={recipesSubtitle(home.recipesByGroup.get(group.id) ?? 0)}
          hasChevron
          onPress={() =>
            router.push({ pathname: "/recettes/[groupId]", params: { groupId: group.id } })
          }
        />
        <ListRow
          icon="users"
          label="Le foyer"
          subtitle={memberNamesLine(group.members)}
          hasChevron
          onPress={() => router.push({ pathname: "/group/[id]", params: { id: group.id } })}
        />
      </ListCard>
    </Section>
  );
}

// Premier lancement : aucun groupe. Une assiette vide, et les deux façons d'en avoir un.
function EmptyHome({ styles }: { styles: Styles }) {
  return (
    <View style={styles.empty}>
      <View style={styles.plate}>
        <View style={styles.plateInner} />
      </View>
      <Text style={styles.emptyTitle} accessibilityRole="header">
        Il te manque{"\n"}une tablée
      </Text>
      <Text style={styles.emptyText}>
        Crée ton foyer et invite ceux qui mangent avec toi. Ça prend 20 secondes.
      </Text>
      <View style={styles.emptyActions}>
        <PrimaryButton label="Créer un groupe" onPress={() => router.push("/create-group")} />
        <TextButton label="Rejoindre avec un code" onPress={() => router.push("/join-group")} />
        <TextButton label="Organiser un repas" onPress={() => router.push("/soiree/new")} />
      </View>
    </View>
  );
}

function createStyles({ colors, spacing, radius, fonts, fontSize }: Theme) {
  return StyleSheet.create({
    screen: { backgroundColor: colors.background },
    content: { gap: spacing.xl },
    contentEmpty: { flexGrow: 1 },
    pressed: { opacity: 0.6 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.md,
    },
    greeting: { gap: 2 },
    title: {
      flex: 1,
      color: colors.text,
      fontFamily: fonts.display,
      fontSize: fontSize.screenTitle,
      lineHeight: 34,
    },
    titleName: { color: colors.brand },
    titleText: { color: colors.text },
    tonight: { gap: spacing.md },
    links: { alignItems: "center", gap: spacing.xs },
    empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.lg },
    plate: {
      width: 150,
      height: 150,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.pill,
      borderWidth: 6,
      borderColor: colors.brand,
    },
    plateInner: {
      width: 86,
      height: 86,
      borderRadius: radius.pill,
      borderWidth: 6,
      borderColor: colors.brand,
    },
    emptyTitle: {
      color: colors.text,
      fontFamily: fonts.display,
      fontSize: fontSize.screenTitle,
      lineHeight: 36,
      textAlign: "center",
    },
    emptyText: {
      maxWidth: 300,
      color: colors.textMuted,
      fontSize: fontSize.body,
      lineHeight: 24,
      textAlign: "center",
    },
    emptyActions: { alignSelf: "stretch", gap: spacing.xs, marginTop: spacing.lg },
  });
}
