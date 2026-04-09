// @vitest-environment jsdom

import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FileViewer } from "@/components/gallery/file-viewer";
import type { FileInfo } from "@/types/files";

const { pushMock, translations } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  translations: {
    "common.loading": "Loading...",
    "gallery.file_viewer.details": "Details",
    "gallery.file_viewer.presentation.fullscreen": "Fullscreen",
    "gallery.file_viewer.presentation.modal": "Modal",
    "gallery.file_viewer.previous_button": "Previous",
    "gallery.file_viewer.next_button": "Next",
    "gallery.file_viewer.name": "Name",
    "gallery.file_viewer.date": "Date",
    "gallery.file_viewer.size": "Size",
    "gallery.file_viewer.url": "URL",
    "gallery.file_viewer.path": "Path",
    "gallery.file_viewer.view_logs": "View logs",
    "gallery.file_viewer.actions": "Actions",
    "gallery.file_viewer.copy_url": "Copy URL",
    "gallery.file_viewer.open": "Open",
    "gallery.file_viewer.secured": "Secured",
    "gallery.file_viewer.public": "Public",
    "gallery.file_viewer.starred": "Starred",
    "gallery.file_viewer.star": "Star",
    "gallery.file_viewer.accessibility": "Viewer accessibility",
  } as Record<string, string>,
}));

vi.mock("next/image", () => ({
  default: ({ fill: _fill, priority: _priority, ...props }: any) => <img {...props} />,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

vi.mock("@/lib/i18n", () => ({
  useTranslation: () => ({
    t: (key: string) => translations[key] ?? key,
  }),
}));

vi.mock("@/lib/i18n/date-locales", () => ({
  useDateLocale: () => undefined,
}));

vi.mock("@/components/gallery/file-albums-section", () => ({
  FileAlbumsSection: () => <div data-testid="file-albums-section" />,
}));

vi.mock("@/components/gallery/module-actions", () => ({
  ModuleActions: ({ variant }: { variant?: string }) => (
    <div data-testid={`module-actions-${variant ?? "default"}`} />
  ),
}));

vi.mock("@/components/albums/add-to-album-dialog", () => ({
  AddToAlbumDialog: () => null,
}));

vi.mock("@/components/albums/create-album-dialog", () => ({
  CreateAlbumDialog: () => null,
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const file: FileInfo = {
  name: "viewer-file.png",
  url: "/api/files/viewer-file.png",
  size: 4096,
  createdAt: "2026-04-02T10:30:00.000Z",
  isSecure: false,
  isStarred: true,
};

function buildProps(
  overrides: Partial<React.ComponentProps<typeof FileViewer>> = {},
): React.ComponentProps<typeof FileViewer> {
  return {
    file,
    presentation: "fullscreen",
    onPresentationChange: vi.fn(),
    onClose: vi.fn(),
    onDelete: vi.fn(async () => {}),
    onCopy: vi.fn(),
    onToggleSecurity: vi.fn(async () => {}),
    onToggleStar: vi.fn(async () => {}),
    onPrevious: vi.fn(),
    onNext: vi.fn(),
    hasPrevious: true,
    hasNext: true,
    ...overrides,
  };
}

describe("FileViewer", () => {
  it("renders the fullscreen presentation without a dialog wrapper", async () => {
    const user = userEvent.setup();
    const onPresentationChange = vi.fn();

    render(
      <FileViewer
        {...buildProps({
          presentation: "fullscreen",
          onPresentationChange,
        })}
      />,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getAllByText("viewer-file.png").length).toBeGreaterThan(0);

    await user.click(screen.getAllByRole("button", { name: "Modal" })[0]);

    expect(onPresentationChange).toHaveBeenCalledWith("modal");
  });

  it("renders the modal presentation and lets the user switch back to fullscreen", async () => {
    const user = userEvent.setup();
    const onPresentationChange = vi.fn();

    render(
      <FileViewer
        {...buildProps({
          presentation: "modal",
          onPresentationChange,
        })}
      />,
    );

    expect(
      screen.getByRole("dialog", {
        name: "viewer-file.png",
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("viewer-file.png").length).toBeGreaterThan(0);

    await user.click(screen.getAllByRole("button", { name: "Fullscreen" })[0]);

    expect(onPresentationChange).toHaveBeenCalledWith("fullscreen");
  });

  it("supports keyboard navigation with the arrow keys and escape", async () => {
    const user = userEvent.setup();
    const onPrevious = vi.fn();
    const onNext = vi.fn();
    const onClose = vi.fn();

    render(
      <FileViewer
        {...buildProps({
          onPrevious,
          onNext,
          onClose,
        })}
      />,
    );

    await user.keyboard("{ArrowLeft}");
    await user.keyboard("{ArrowRight}");
    await user.keyboard("{Escape}");

    expect(onPrevious).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
