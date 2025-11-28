"use client";

import React from "react";
import { ThemeStyles } from "@/types/new-theme";

interface NewThemeTypographyPreviewProps {
  styles: ThemeStyles;
  currentMode: "light" | "dark";
}

const NewThemeTypographyPreview: React.FC<NewThemeTypographyPreviewProps> = ({
  styles,
  currentMode,
}) => {
  return (
    <div className="space-y-8">
      <h2 className="text-lg font-semibold">Typography Preview</h2>

      {/* Headings */}
      <div className="space-y-4">
        <h3 className="text-base font-semibold">Headings</h3>
        <div className="space-y-3">
          <h1 className="scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl">
            The quick brown fox jumps over the lazy dog
          </h1>
          <h2 className="scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight">
            The quick brown fox jumps over the lazy dog
          </h2>
          <h3 className="scroll-m-20 text-2xl font-semibold tracking-tight">
            The quick brown fox jumps over the lazy dog
          </h3>
          <h4 className="scroll-m-20 text-xl font-semibold tracking-tight">
            The quick brown fox jumps over the lazy dog
          </h4>
          <h5 className="scroll-m-20 text-lg font-semibold">
            The quick brown fox jumps over the lazy dog
          </h5>
          <h6 className="scroll-m-20 text-base font-semibold">
            The quick brown fox jumps over the lazy dog
          </h6>
        </div>
      </div>

      {/* Body Text */}
      <div className="space-y-4">
        <h3 className="text-base font-semibold">Body Text</h3>
        <div className="space-y-4">
          <p className="leading-7">
            This is a regular paragraph with normal text. It contains a{" "}
            <a href="#" className="font-medium text-primary underline underline-offset-4">
              link
            </a>{" "}
            and some <strong>bold text</strong> and <em>italic text</em> for demonstration purposes.
          </p>
          <p className="text-sm text-muted-foreground">
            This is smaller, muted text often used for captions or secondary information.
          </p>
          <blockquote className="mt-6 border-l-2 pl-6 italic">
            "This is a blockquote. It's often used to highlight important information or quotes from users."
          </blockquote>
        </div>
      </div>

      {/* Lists */}
      <div className="space-y-4">
        <h3 className="text-base font-semibold">Lists</h3>
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <h4 className="text-sm font-medium mb-2">Unordered List</h4>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li>First item in the list</li>
              <li>Second item with more content</li>
              <li>Third item here</li>
              <li>Last item in our list</li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-medium mb-2">Ordered List</h4>
            <ol className="list-decimal list-inside space-y-1 text-sm">
              <li>First step in the process</li>
              <li>Second step follows</li>
              <li>Third step is important</li>
              <li>Final step completes it</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Code */}
      <div className="space-y-4">
        <h3 className="text-base font-semibold">Code</h3>
        <div className="space-y-3">
          <div>
            <p className="text-sm mb-2">Inline code:</p>
            <p className="text-sm">
              You can use the <code className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold">console.log()</code> function to debug your code.
            </p>
          </div>
          <div>
            <p className="text-sm mb-2">Code block:</p>
            <pre className="overflow-x-auto rounded-md bg-muted p-4 text-sm">
              <code>{`function greetUser(name) {
  console.log(\`Hello, \${name}!\`);
  return \`Welcome, \${name}\`;
}`}</code>
            </pre>
          </div>
        </div>
      </div>

      {/* Font Samples */}
      <div className="space-y-4">
        <h3 className="text-base font-semibold">Font Families</h3>
        <div className="space-y-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Sans Serif</p>
            <p className="font-sans text-lg">The quick brown fox jumps over the lazy dog</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Serif</p>
            <p className="font-serif text-lg">The quick brown fox jumps over the lazy dog</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Monospace</p>
            <p className="font-mono text-lg">The quick brown fox jumps over the lazy dog</p>
          </div>
        </div>
      </div>

      {/* Text Sizes */}
      <div className="space-y-4">
        <h3 className="text-base font-semibold">Text Sizes</h3>
        <div className="space-y-2">
          <p className="text-xs">Extra Small (xs) - The quick brown fox jumps over the lazy dog</p>
          <p className="text-sm">Small (sm) - The quick brown fox jumps over the lazy dog</p>
          <p className="text-base">Base - The quick brown fox jumps over the lazy dog</p>
          <p className="text-lg">Large (lg) - The quick brown fox jumps over the lazy dog</p>
          <p className="text-xl">Extra Large (xl) - The quick brown fox jumps over the lazy dog</p>
          <p className="text-2xl">2XL - The quick brown fox jumps over the lazy dog</p>
        </div>
      </div>
    </div>
  );
};

export default NewThemeTypographyPreview;
