import React from "react";
import NewThemeControlSection from "../components/new-theme-control-section";
import NewThemeSliderWithInput from "../components/new-theme-slider-with-input";
import NewThemeHslAdjustmentControls from "../components/new-theme-hsl-adjustment-controls";

interface NewThemeOtherTabProps {
  currentStyles: any;
  updateStyle: <K extends keyof any>(key: K, value: any[K]) => void;
}

const NewThemeOtherTab: React.FC<NewThemeOtherTabProps> = ({
  currentStyles,
  updateStyle,
}) => {
  const radius = parseFloat(currentStyles.radius?.replace("rem", "") || "0.5");

  return (
    <>
      <NewThemeControlSection title="HSL Adjustments" expanded>
        <NewThemeHslAdjustmentControls
          currentStyles={currentStyles}
          updateStyle={updateStyle}
        />
      </NewThemeControlSection>

      <NewThemeControlSection title="Radius" expanded>
        <NewThemeSliderWithInput
          value={radius}
          onChange={(value) => updateStyle("radius", `${value}rem`)}
          min={0}
          max={5}
          step={0.025}
          unit="rem"
          label="Radius"
        />
      </NewThemeControlSection>

      <NewThemeControlSection title="Spacing">
        <NewThemeSliderWithInput
          value={parseFloat(currentStyles?.spacing?.replace("rem", "") || "0.25")}
          onChange={(value) => updateStyle("spacing", `${value}rem`)}
          min={0.15}
          max={0.35}
          step={0.01}
          unit="rem"
          label="Spacing"
        />
      </NewThemeControlSection>

      <NewThemeControlSection title="Shadow">
        {/* TODO: Implement Shadow Control component */}
        <div className="text-sm text-muted-foreground">
          Shadow controls will be implemented
        </div>
      </NewThemeControlSection>
    </>
  );
};

export default NewThemeOtherTab;
