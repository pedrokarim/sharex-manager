// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSetAtom } from "jotai";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { useRoutedFileViewer } from "@/hooks/use-routed-file-viewer";
import { fileViewerPresentationAtom } from "@/lib/atoms/preferences";

function HookHarness() {
  const { fileName, presentation, openFile, closeFile } = useRoutedFileViewer();
  const setPresentation = useSetAtom(fileViewerPresentationAtom);

  return (
    <div>
      <div data-testid="file-name">{fileName ?? "none"}</div>
      <div data-testid="presentation">{presentation}</div>
      <button type="button" onClick={() => openFile("hello world.png")}>
        open
      </button>
      <button type="button" onClick={() => setPresentation("modal")}>
        prefer modal
      </button>
      <button type="button" onClick={() => setPresentation("fullscreen")}>
        prefer fullscreen
      </button>
      <button type="button" onClick={closeFile}>
        close
      </button>
    </div>
  );
}

describe("useRoutedFileViewer", () => {
  beforeEach(async () => {
    window.localStorage.clear();
  });

  it("opens in fullscreen by default and preserves unrelated query params", async () => {
    const onUrlUpdate = vi.fn();
    const user = userEvent.setup();

    render(
      <NuqsTestingAdapter
        searchParams="?view=details&q=flowers&sort=name&start=2026-04-01&end=2026-04-02"
        hasMemory
        onUrlUpdate={onUrlUpdate}
      >
        <HookHarness />
      </NuqsTestingAdapter>,
    );

    await user.click(screen.getByRole("button", { name: "prefer fullscreen" }));
    await user.click(screen.getByRole("button", { name: "open" }));

    await waitFor(() =>
      expect(screen.getByTestId("file-name")).toHaveTextContent("hello world.png"),
    );
    expect(screen.getByTestId("presentation")).toHaveTextContent("fullscreen");

    const openEvent = onUrlUpdate.mock.calls.at(-1)?.[0];
    expect(openEvent.options.history).toBe("push");
    expect(openEvent.searchParams.get("file")).toBe("hello world.png");
    expect(openEvent.searchParams.get("viewer")).toBeNull();
    expect(openEvent.searchParams.get("view")).toBe("details");
    expect(openEvent.searchParams.get("q")).toBe("flowers");
    expect(openEvent.searchParams.get("sort")).toBe("name");
    expect(openEvent.searchParams.get("start")).toBe("2026-04-01");
    expect(openEvent.searchParams.get("end")).toBe("2026-04-02");
  });

  it("follows the preference, keeps it out of the URL and clears the file on close", async () => {
    const onUrlUpdate = vi.fn();
    const user = userEvent.setup();

    render(
      <NuqsTestingAdapter
        searchParams="?view=list&q=archive"
        hasMemory
        onUrlUpdate={onUrlUpdate}
      >
        <HookHarness />
      </NuqsTestingAdapter>,
    );

    await user.click(screen.getByRole("button", { name: "prefer modal" }));
    await waitFor(() =>
      expect(screen.getByTestId("presentation")).toHaveTextContent("modal"),
    );
    // La préférence ne touche pas à l'adresse.
    expect(onUrlUpdate).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("fileViewerPresentation")).toBe('"modal"');

    await user.click(screen.getByRole("button", { name: "open" }));
    await waitFor(() =>
      expect(screen.getByTestId("file-name")).toHaveTextContent("hello world.png"),
    );
    expect(screen.getByTestId("presentation")).toHaveTextContent("modal");

    const openEvent = onUrlUpdate.mock.calls.at(-1)?.[0];
    expect(openEvent.searchParams.get("file")).toBe("hello world.png");
    expect(openEvent.searchParams.get("viewer")).toBeNull();

    await user.click(screen.getByRole("button", { name: "close" }));

    await waitFor(() =>
      expect(screen.getByTestId("file-name")).toHaveTextContent("none"),
    );
    // Fermer un fichier ne remet pas la préférence à zéro.
    expect(screen.getByTestId("presentation")).toHaveTextContent("modal");

    const closeEvent = onUrlUpdate.mock.calls.at(-1)?.[0];
    expect(closeEvent.options.history).toBe("replace");
    expect(closeEvent.searchParams.get("file")).toBeNull();
    expect(closeEvent.searchParams.get("view")).toBe("list");
    expect(closeEvent.searchParams.get("q")).toBe("archive");
  });
});
