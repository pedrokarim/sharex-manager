// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { useRoutedFileViewer } from "@/hooks/use-routed-file-viewer";

function HookHarness() {
  const {
    fileName,
    presentation,
    openFile,
    closeFile,
    setPresentation,
  } = useRoutedFileViewer();

  return (
    <div>
      <div data-testid="file-name">{fileName ?? "none"}</div>
      <div data-testid="presentation">{presentation}</div>
      <button type="button" onClick={() => openFile("hello world.png")}>
        open
      </button>
      <button type="button" onClick={() => setPresentation("modal")}>
        modal
      </button>
      <button type="button" onClick={() => setPresentation("fullscreen")}>
        fullscreen
      </button>
      <button type="button" onClick={closeFile}>
        close
      </button>
    </div>
  );
}

describe("useRoutedFileViewer", () => {
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

    await user.click(screen.getByRole("button", { name: "open" }));

    await waitFor(() =>
      expect(screen.getByTestId("file-name")).toHaveTextContent("hello world.png"),
    );
    expect(screen.getByTestId("presentation")).toHaveTextContent("fullscreen");

    const openEvent = onUrlUpdate.mock.calls.at(-1)?.[0];
    expect(openEvent.options.history).toBe("push");
    expect(openEvent.searchParams.get("file")).toBe("hello world.png");
    expect(openEvent.searchParams.get("viewer")).toBe("fullscreen");
    expect(openEvent.searchParams.get("view")).toBe("details");
    expect(openEvent.searchParams.get("q")).toBe("flowers");
    expect(openEvent.searchParams.get("sort")).toBe("name");
    expect(openEvent.searchParams.get("start")).toBe("2026-04-01");
    expect(openEvent.searchParams.get("end")).toBe("2026-04-02");
  });

  it("switches presentation with replace history and clears viewer params on close", async () => {
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

    await user.click(screen.getByRole("button", { name: "open" }));
    await waitFor(() =>
      expect(screen.getByTestId("file-name")).toHaveTextContent("hello world.png"),
    );

    await user.click(screen.getByRole("button", { name: "modal" }));

    await waitFor(() =>
      expect(screen.getByTestId("presentation")).toHaveTextContent("modal"),
    );

    const modalEvent = onUrlUpdate.mock.calls.at(-1)?.[0];
    expect(modalEvent.options.history).toBe("replace");
    expect(modalEvent.searchParams.get("file")).toBe("hello world.png");
    expect(modalEvent.searchParams.get("viewer")).toBe("modal");
    expect(modalEvent.searchParams.get("view")).toBe("list");
    expect(modalEvent.searchParams.get("q")).toBe("archive");

    await user.click(screen.getByRole("button", { name: "close" }));

    await waitFor(() =>
      expect(screen.getByTestId("file-name")).toHaveTextContent("none"),
    );
    expect(screen.getByTestId("presentation")).toHaveTextContent("fullscreen");

    const closeEvent = onUrlUpdate.mock.calls.at(-1)?.[0];
    expect(closeEvent.options.history).toBe("replace");
    expect(closeEvent.searchParams.get("file")).toBeNull();
    expect(closeEvent.searchParams.get("viewer")).toBeNull();
    expect(closeEvent.searchParams.get("view")).toBe("list");
    expect(closeEvent.searchParams.get("q")).toBe("archive");
  });
});
