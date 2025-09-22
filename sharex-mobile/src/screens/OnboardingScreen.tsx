// Écran d'onboarding moderne

import React, { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ScrollView,
  Image,
  StatusBar,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Icon } from "../components/Icon";

const { width, height } = Dimensions.get("window");

interface OnboardingScreenProps {
  onComplete: () => void;
  navigation: any;
}

interface OnboardingSlide {
  id: number;
  title: string;
  subtitle: string;
  description: string;
  icon: string;
  color: string;
  backgroundColor: string;
}

const slides: OnboardingSlide[] = [
  {
    id: 1,
    title: "Bienvenue sur",
    subtitle: "ShareX Manager",
    description:
      "L'application mobile pour uploader et gérer vos images facilement",
    icon: "phone-portrait",
    color: "#007AFF",
    backgroundColor: "#F0F8FF",
  },
  {
    id: 2,
    title: "Upload rapide",
    subtitle: "En un clic",
    description:
      "Prenez une photo ou sélectionnez depuis votre galerie et uploadez instantanément",
    icon: "flash",
    color: "#34C759",
    backgroundColor: "#F0FFF4",
  },
  {
    id: 3,
    title: "Partage facile",
    subtitle: "Avec Share Intent",
    description:
      "Partagez des images depuis n'importe quelle app directement vers ShareX Manager",
    icon: "link",
    color: "#FF9500",
    backgroundColor: "#FFF8F0",
  },
  {
    id: 4,
    title: "Galerie organisée",
    subtitle: "Tout en un endroit",
    description:
      "Consultez votre historique d'uploads, copiez les liens et gérez vos images",
    icon: "images",
    color: "#AF52DE",
    backgroundColor: "#F8F0FF",
  },
];

export const OnboardingScreen: React.FC<OnboardingScreenProps> = ({
  onComplete,
  navigation,
}) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();

  const handleNext = () => {
    if (currentSlide < slides.length - 1) {
      const nextSlide = currentSlide + 1;
      setCurrentSlide(nextSlide);
      scrollViewRef.current?.scrollTo({
        x: nextSlide * width,
        animated: true,
      });
    } else {
      // Sauvegarder l'état d'onboarding
      onComplete();
      // Naviguer directement vers MainTabs
      navigation.reset({
        index: 0,
        routes: [{ name: "MainTabs" }],
      });
    }
  };

  const handleSkip = () => {
    // Sauvegarder l'état d'onboarding
    onComplete();
    // Naviguer directement vers MainTabs
    navigation.reset({
      index: 0,
      routes: [{ name: "MainTabs" }],
    });
  };

  const handleScroll = (event: any) => {
    const slideIndex = Math.round(event.nativeEvent.contentOffset.x / width);
    setCurrentSlide(slideIndex);
  };

  const renderSlide = (slide: OnboardingSlide, index: number) => (
    <View
      key={slide.id}
      style={[
        styles.slide,
        {
          backgroundColor: slide.backgroundColor,
        },
      ]}
    >
      <View style={styles.slideContent}>
        {/* Icône principale */}
        <View style={[styles.iconContainer, { backgroundColor: slide.color }]}>
          <Icon name={slide.icon} size={48} color="#ffffff" type="ionicons" />
        </View>

        {/* Titre et sous-titre */}
        <View style={styles.textContainer}>
          <Text style={styles.title}>{slide.title}</Text>
          <Text style={[styles.subtitle, { color: slide.color }]}>
            {slide.subtitle}
          </Text>
          <Text style={styles.description}>{slide.description}</Text>
        </View>

        {/* Boutons d'action */}
        <View style={styles.buttonContainer}>
          {index === slides.length - 1 ? (
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: slide.color }]}
              onPress={handleNext}
            >
              <Text style={styles.primaryButtonText}>Commencer</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
                <Text style={styles.skipButtonText}>Passer</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.nextButton, { backgroundColor: slide.color }]}
                onPress={handleNext}
              >
                <Text style={styles.nextButtonText}>Suivant</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        style={styles.scrollView}
      >
        {slides.map((slide, index) => renderSlide(slide, index))}
      </ScrollView>

      {/* Indicateurs de pagination */}
      <View style={styles.paginationContainer}>
        {slides.map((_, index) => (
          <View
            key={index}
            style={[
              styles.paginationDot,
              {
                backgroundColor: index === currentSlide ? "#007AFF" : "#E0E0E0",
                width: index === currentSlide ? 24 : 8,
              },
            ]}
          />
        ))}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  scrollView: {
    flex: 1,
  },
  slide: {
    width,
    justifyContent: "center",
    alignItems: "center",
  },
  slideContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 40,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  textContainer: {
    alignItems: "center",
    marginBottom: 60,
  },
  title: {
    fontSize: 28,
    fontWeight: "300",
    color: "#333333",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 32,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 16,
  },
  description: {
    fontSize: 16,
    color: "#666666",
    textAlign: "center",
    lineHeight: 24,
    maxWidth: 280,
  },
  buttonContainer: {
    width: "100%",
    paddingHorizontal: 20,
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  primaryButton: {
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 25,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "600",
  },
  skipButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  skipButtonText: {
    color: "#999999",
    fontSize: 16,
    fontWeight: "500",
  },
  nextButton: {
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 20,
    alignItems: "center",
  },
  nextButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  paginationContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 20,
  },
  paginationDot: {
    height: 8,
    borderRadius: 4,
    marginHorizontal: 4,
  },
});
