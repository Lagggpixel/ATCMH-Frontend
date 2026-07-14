export const ATTEMPT_NAVIGATION_MESSAGE = "Leaving will submit your current answers. Stay on this page to continue the exam.";

type Answers = Record<string, string>;
type FetchLike = (input: string, init: RequestInit) => Promise<unknown>;

export interface AttemptNavigationWindow {
  location: { href: string; assign(href: string): void };
  history: {
    pushState(state: unknown, title: string, url?: string | URL | null): void;
    go(delta: number): void;
    back(): void;
  };
  confirm(message: string): boolean;
  addEventListener(type: string, listener: (event: any) => void, options?: boolean | AddEventListenerOptions): void;
  removeEventListener(type: string, listener: (event: any) => void, options?: boolean | EventListenerOptions): void;
}

export interface AttemptNavigationProtectionOptions {
  window: AttemptNavigationWindow;
  quizId: string;
  getAnswers(): Answers;
  onConfirmedNavigation(): Promise<boolean>;
  sendKeepalive?(quizId: string, answers: Answers): boolean;
}

export function sendAttemptKeepalive(
  quizId: string,
  answers: Answers,
  csrfToken: string,
  request: FetchLike = globalThis.fetch,
): boolean {
  try {
    void request(`/exams/api/quizzes/${encodeURIComponent(quizId)}/attempt/submit`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "text/plain;charset=UTF-8", "X-CSRF-Token": csrfToken },
      body: JSON.stringify({ answers }),
      keepalive: true,
    }).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

export function createAttemptNavigationProtection(options: AttemptNavigationProtectionOptions) {
  let installed = false;
  let navigating = false;
  let disarmed = false;

  const completeNavigation = async (navigate: () => void) => {
    if (navigating || disarmed || !options.window.confirm(ATTEMPT_NAVIGATION_MESSAGE)) return;

    navigating = true;
    try {
      if (await options.onConfirmedNavigation()) {
        disarmed = true;
        navigate();
        return;
      }
    } finally {
      if (!disarmed) navigating = false;
    }
  };

  const onBeforeUnload = (event: BeforeUnloadEvent) => {
    if (disarmed) return;
    event.preventDefault();
    event.returnValue = ATTEMPT_NAVIGATION_MESSAGE;
  };

  const onPageHide = () => {
    if (!disarmed) options.sendKeepalive?.(options.quizId, options.getAnswers());
  };

  const onClick = (event: MouseEvent) => {
    if (disarmed || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as Element | null)?.closest("a[href]") as HTMLAnchorElement | null;
    if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;

    const destination = new URL(anchor.href, options.window.location.href);
    if (destination.origin !== new URL(options.window.location.href).origin) return;

    event.preventDefault();
    void completeNavigation(() => options.window.location.assign(destination.href));
  };

  const onPopState = () => {
    if (disarmed || navigating) return;
    options.window.history.go(1);
    void completeNavigation(() => options.window.history.back());
  };

  return {
    install() {
      if (installed) return;
      installed = true;
      options.window.history.pushState({ attemptNavigationProtection: true }, "", options.window.location.href);
      options.window.addEventListener("beforeunload", onBeforeUnload);
      options.window.addEventListener("pagehide", onPageHide);
      options.window.addEventListener("click", onClick, true);
      options.window.addEventListener("popstate", onPopState);
    },
    uninstall() {
      if (!installed) return;
      installed = false;
      options.window.removeEventListener("beforeunload", onBeforeUnload);
      options.window.removeEventListener("pagehide", onPageHide);
      options.window.removeEventListener("click", onClick, true);
      options.window.removeEventListener("popstate", onPopState);
    },
  };
}
