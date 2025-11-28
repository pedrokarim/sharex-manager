import React from "react";
import { AlertCircle } from "lucide-react";
import { Label } from "@/components/ui/label";
import NewThemeControlSection from "../components/new-theme-control-section";
import NewThemeSliderWithInput from "../components/new-theme-slider-with-input";

interface NewThemeTypographyTabProps {
  currentStyles: any;
  updateStyle: <K extends keyof any>(key: K, value: any[K]) => void;
  themeState: any;
}

const NewThemeTypographyTab: React.FC<NewThemeTypographyTabProps> = ({
  currentStyles,
  updateStyle,
}) => {
  return (
    <>
      <div className="bg-muted/50 mb-4 flex items-start gap-2.5 rounded-md border p-3">
        <AlertCircle className="text-muted-foreground mt-0.5 h-5 w-5 shrink-0" />
        <div className="text-muted-foreground text-sm">
          <p>
            To use custom fonts, embed them in your project. <br />
            See{" "}
            <a
              href="https://tailwindcss.com/docs/font-family"
              target="_blank"
              className="hover:text-muted-foreground/90 underline underline-offset-2"
            >
              Tailwind docs
            </a>{" "}
            for details.
          </p>
        </div>
      </div>

      <NewThemeControlSection title="Font Family" expanded className="p-3">
        <div className="mb-4">
          <Label htmlFor="font-sans" className="mb-1.5 block text-xs">
            Sans-Serif Font
          </Label>
          {/* TODO: Implement FontPicker component */}
          <div className="text-sm text-muted-foreground">
            Font picker will be implemented
          </div>
        </div>

        <div className="mb-4">
          <Label htmlFor="font-serif" className="mb-1.5 block text-xs">
            Serif Font
          </Label>
          {/* TODO: Implement FontPicker component */}
          <div className="text-sm text-muted-foreground">
            Font picker will be implemented
          </div>
        </div>

        <div>
          <Label htmlFor="font-mono" className="mb-1.5 block text-xs">
            Monospace Font
          </Label>
          {/* TODO: Implement FontPicker component */}
          <div className="text-sm text-muted-foreground">
            Font picker will be implemented
          </div>
        </div>
      </NewThemeControlSection>

      <NewThemeControlSection title="Letter Spacing" expanded>
        <NewThemeSliderWithInput
          value={parseFloat(currentStyles["letter-spacing"]?.replace("em", "")) || 0}
          onChange={(value) => updateStyle("letter-spacing", `${value}em`)}
          min={-0.5}
          max={0.5}
          step={0.025}
          unit="em"
          label="Letter Spacing"
        />
      </NewThemeControlSection>
    </>
  );
};

export default NewThemeTypographyTab;
