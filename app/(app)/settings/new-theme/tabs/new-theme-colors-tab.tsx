import React from "react";
import NewThemeColorPicker from "../components/new-theme-color-picker";
import NewThemeControlSection from "../components/new-theme-control-section";

interface NewThemeColorsTabProps {
  currentStyles: any;
  updateStyle: <K extends keyof any>(key: K, value: any[K]) => void;
}

const NewThemeColorsTab: React.FC<NewThemeColorsTabProps> = ({
  currentStyles,
  updateStyle,
}) => {
  return (
    <>
      <NewThemeControlSection title="Primary Colors" expanded>
        <NewThemeColorPicker
          name="primary"
          color={currentStyles.primary}
          onChange={(color) => updateStyle("primary", color)}
          label="Primary"
        />
        <NewThemeColorPicker
          name="primary-foreground"
          color={currentStyles["primary-foreground"]}
          onChange={(color) => updateStyle("primary-foreground", color)}
          label="Primary Foreground"
        />
      </NewThemeControlSection>

      <NewThemeControlSection title="Secondary Colors" expanded>
        <NewThemeColorPicker
          name="secondary"
          color={currentStyles.secondary}
          onChange={(color) => updateStyle("secondary", color)}
          label="Secondary"
        />
        <NewThemeColorPicker
          name="secondary-foreground"
          color={currentStyles["secondary-foreground"]}
          onChange={(color) => updateStyle("secondary-foreground", color)}
          label="Secondary Foreground"
        />
      </NewThemeControlSection>

      <NewThemeControlSection title="Accent Colors">
        <NewThemeColorPicker
          name="accent"
          color={currentStyles.accent}
          onChange={(color) => updateStyle("accent", color)}
          label="Accent"
        />
        <NewThemeColorPicker
          name="accent-foreground"
          color={currentStyles["accent-foreground"]}
          onChange={(color) => updateStyle("accent-foreground", color)}
          label="Accent Foreground"
        />
      </NewThemeControlSection>

      <NewThemeControlSection title="Base Colors">
        <NewThemeColorPicker
          name="background"
          color={currentStyles.background}
          onChange={(color) => updateStyle("background", color)}
          label="Background"
        />
        <NewThemeColorPicker
          name="foreground"
          color={currentStyles.foreground}
          onChange={(color) => updateStyle("foreground", color)}
          label="Foreground"
        />
      </NewThemeControlSection>

      <NewThemeControlSection title="Card Colors">
        <NewThemeColorPicker
          name="card"
          color={currentStyles.card}
          onChange={(color) => updateStyle("card", color)}
          label="Card Background"
        />
        <NewThemeColorPicker
          name="card-foreground"
          color={currentStyles["card-foreground"]}
          onChange={(color) => updateStyle("card-foreground", color)}
          label="Card Foreground"
        />
      </NewThemeControlSection>

      <NewThemeControlSection title="Popover Colors">
        <NewThemeColorPicker
          name="popover"
          color={currentStyles.popover}
          onChange={(color) => updateStyle("popover", color)}
          label="Popover Background"
        />
        <NewThemeColorPicker
          name="popover-foreground"
          color={currentStyles["popover-foreground"]}
          onChange={(color) => updateStyle("popover-foreground", color)}
          label="Popover Foreground"
        />
      </NewThemeControlSection>

      <NewThemeControlSection title="Muted Colors">
        <NewThemeColorPicker
          name="muted"
          color={currentStyles.muted}
          onChange={(color) => updateStyle("muted", color)}
          label="Muted"
        />
        <NewThemeColorPicker
          name="muted-foreground"
          color={currentStyles["muted-foreground"]}
          onChange={(color) => updateStyle("muted-foreground", color)}
          label="Muted Foreground"
        />
      </NewThemeControlSection>

      <NewThemeControlSection title="Destructive Colors">
        <NewThemeColorPicker
          name="destructive"
          color={currentStyles.destructive}
          onChange={(color) => updateStyle("destructive", color)}
          label="Destructive"
        />
        <NewThemeColorPicker
          name="destructive-foreground"
          color={currentStyles["destructive-foreground"]}
          onChange={(color) => updateStyle("destructive-foreground", color)}
          label="Destructive Foreground"
        />
      </NewThemeControlSection>

      <NewThemeControlSection title="Border & Input Colors">
        <NewThemeColorPicker
          name="border"
          color={currentStyles.border}
          onChange={(color) => updateStyle("border", color)}
          label="Border"
        />
        <NewThemeColorPicker
          name="input"
          color={currentStyles.input}
          onChange={(color) => updateStyle("input", color)}
          label="Input"
        />
        <NewThemeColorPicker
          name="ring"
          color={currentStyles.ring}
          onChange={(color) => updateStyle("ring", color)}
          label="Ring"
        />
      </NewThemeControlSection>
    </>
  );
};

export default NewThemeColorsTab;
