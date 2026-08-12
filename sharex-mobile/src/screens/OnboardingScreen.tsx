import React, { useRef, useState } from "react";
import { Image, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Icon } from "../components/Icon";
import { BORDER_RADIUS, COLORS, SHADOWS, TYPOGRAPHY } from "../config/design";

interface OnboardingScreenProps {
  onComplete: () => void;
  navigation: any;
}

const slides = [
  {
    kicker: "BIENVENUE",
    title: "Vos images vous suivent partout.",
    description: "Envoyez une capture, une photo ou un visuel vers votre serveur ShareX Manager en quelques secondes.",
    icon: "cloud-upload-outline",
    image: require("../../assets/editorial-onboarding.png"),
  },
  {
    kicker: "UN SEUL GESTE",
    title: "Partagez depuis toutes vos apps.",
    description: "Choisissez ShareX Manager dans le menu de partage : votre image est prête à être envoyée.",
    icon: "share-social-outline",
    image: require("../../assets/editorial-onboarding-share.png"),
  },
  {
    kicker: "TOUT EST PRÊT",
    title: "Retrouvez, copiez, partagez.",
    description: "Gardez vos derniers uploads à portée de main et récupérez leurs liens publics instantanément.",
    icon: "images-outline",
    image: require("../../assets/editorial-onboarding-gallery.png"),
  },
];

export const OnboardingScreen: React.FC<OnboardingScreenProps> = ({ onComplete, navigation }) => {
  const { width } = useWindowDimensions();
  const [currentSlide, setCurrentSlide] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const finish = async () => {
    await onComplete();
    navigation.reset({ index: 0, routes: [{ name: "MainTabs" }] });
  };

  const next = () => {
    if (currentSlide === slides.length - 1) {
      finish();
      return;
    }
    const nextIndex = currentSlide + 1;
    setCurrentSlide(nextIndex);
    scrollRef.current?.scrollTo({ x: nextIndex * width, animated: true });
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
      <View style={styles.topBar}>
        <View style={styles.brand}>
          <View style={styles.brandIcon}>
            <Image source={require("../../assets/logo-sxm-simple.png")} style={styles.brandLogo} resizeMode="contain" />
          </View>
          <Text style={styles.brandText}>ShareX Manager</Text>
        </View>
        <TouchableOpacity onPress={finish} style={styles.skipButton}>
          <Text style={styles.skipText}>Passer</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(event) => setCurrentSlide(Math.round(event.nativeEvent.contentOffset.x / width))}
      >
        {slides.map((slide, index) => (
          <View key={slide.kicker} style={[styles.slide, { width }]}>
            <View style={[styles.artCard, index === 1 && styles.artCardPurple, index === 2 && styles.artCardPeach]}>
              <Image source={slide.image} style={styles.illustration} resizeMode="contain" />
              <View style={styles.floatingBadge}>
                <Image source={require("../../assets/logo-sxm-simple.png")} style={styles.floatingLogo} resizeMode="contain" />
              </View>
              <View style={styles.featureBadge}><Icon name={slide.icon} size={19} color={COLORS.coral} type="ionicons" /></View>
              <View style={styles.decorDotOne} />
              <View style={styles.decorDotTwo} />
            </View>
            <Text style={styles.kicker}>{slide.kicker}</Text>
            <Text style={styles.title}>{slide.title}</Text>
            <Text style={styles.description}>{slide.description}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.pagination}>
          {slides.map((_, index) => <View key={index} style={[styles.dot, index === currentSlide && styles.dotActive]} />)}
        </View>
        <TouchableOpacity style={styles.nextButton} onPress={next} activeOpacity={0.85}>
          <Text style={styles.nextText}>{currentSlide === slides.length - 1 ? "Commencer" : "Continuer"}</Text>
          <View style={styles.arrowCircle}>
            <Icon name="arrow-forward" size={18} color={COLORS.primary} type="ionicons" />
          </View>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  topBar: { height: 62, paddingHorizontal: 22, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brand: { flexDirection: "row", alignItems: "center", gap: 9 },
  brandIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center", ...SHADOWS.sm },
  brandLogo: { width: 29, height: 29 },
  brandText: { color: COLORS.textPrimary, fontSize: 15, fontWeight: "700", fontFamily: TYPOGRAPHY.rounded },
  skipButton: { paddingHorizontal: 13, paddingVertical: 8, backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.round },
  skipText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: "600" },
  slide: { paddingHorizontal: 22, paddingTop: 10 },
  artCard: { height: "53%", minHeight: 330, maxHeight: 470, borderRadius: 34, overflow: "hidden", backgroundColor: "#FFE2D6", alignItems: "center", justifyContent: "center", ...SHADOWS.sm },
  artCardPurple: { backgroundColor: "#E9DDF3" },
  artCardPeach: { backgroundColor: "#FFD9C8" },
  illustration: { width: "88%", height: "93%" },
  floatingBadge: { position: "absolute", top: 18, right: 18, width: 52, height: 52, borderRadius: 18, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center", ...SHADOWS.sm },
  floatingLogo: { width: 38, height: 38 },
  featureBadge: { position: "absolute", top: 24, left: 22, width: 40, height: 40, borderRadius: 14, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center", ...SHADOWS.sm },
  decorDotOne: { position: "absolute", left: 18, top: 28, width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.coral },
  decorDotTwo: { position: "absolute", left: 34, top: 47, width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.primaryLight },
  kicker: { marginTop: 24, color: COLORS.coral, fontSize: 12, letterSpacing: 1.6, fontWeight: "800", fontFamily: TYPOGRAPHY.rounded },
  title: { marginTop: 8, maxWidth: 360, color: COLORS.textPrimary, fontSize: 30, lineHeight: 36, letterSpacing: -0.5, fontWeight: "700", fontFamily: TYPOGRAPHY.rounded },
  description: { marginTop: 10, maxWidth: 360, color: COLORS.textSecondary, fontSize: 15, lineHeight: 22 },
  footer: { paddingHorizontal: 22, paddingTop: 8, paddingBottom: 12 },
  pagination: { flexDirection: "row", gap: 6, marginBottom: 16 },
  dot: { width: 8, height: 5, borderRadius: 3, backgroundColor: COLORS.gray300 },
  dotActive: { width: 28, backgroundColor: COLORS.coral },
  nextButton: { height: 58, paddingLeft: 21, paddingRight: 7, borderRadius: 21, backgroundColor: COLORS.primary, flexDirection: "row", alignItems: "center", justifyContent: "space-between", ...SHADOWS.md },
  nextText: { color: COLORS.white, fontSize: 16, fontWeight: "700", fontFamily: TYPOGRAPHY.rounded },
  arrowCircle: { width: 44, height: 44, borderRadius: 16, backgroundColor: COLORS.white, alignItems: "center", justifyContent: "center" },
});
