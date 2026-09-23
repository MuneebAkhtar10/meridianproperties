"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useFormStatus } from "react-dom";
import { X } from "lucide-react";

/** Lets anything nested inside an open Modal ask it to close — see
 * `CloseModalOnSubmit` below, which is how a form inside the modal closes it
 * once its own submission actually finishes. */
export const ModalCloseContext = createContext<(() => void) | null>(null);
const ModalStayOpenOnSubmitContext = createContext(false);

let bodyLockCount = 0;

function clearNavigationLock() {
  if (typeof document === "undefined") return;
  document.body.style.overflow = "";
  document.body.style.pointerEvents = "";
  document.documentElement.style.overflow = "";
  document.documentElement.style.pointerEvents = "";
  document.body.removeAttribute("inert");
  document.documentElement.removeAttribute("inert");
  for (const node of Array.from(document.body.children)) {
    if (!(node instanceof HTMLElement)) continue;
    if (node.hasAttribute("inert")) node.removeAttribute("inert");
    if (node.style.pointerEvents === "none") node.style.pointerEvents = "";
  }
}

function lockBody() {
  if (typeof document === "undefined") return;
  if (bodyLockCount === 0) {
    document.body.style.overflow = "hidden";
  }
  bodyLockCount += 1;
}

function unlockBody() {
  if (typeof document === "undefined") return;
  bodyLockCount = Math.max(0, bodyLockCount - 1);
  if (bodyLockCount === 0) {
    clearNavigationLock();
  }
}

/**
 * Drop this inside a `<form>` that lives inside a `Modal` to close the modal
 * once that form's submission completes (success or error alike — the page
 * behind the modal already reflects the outcome via its own message banner).
 * Closing on completion rather than on click keeps the modal open — and its
 * Save button's pending spinner visible — for the full round trip, instead
 * of vanishing the instant the button is pressed.
 *
 * Modals that persist across a server-action redirect (Manage unit) skip
 * this close: unmounting the dialog while Next.js is finishing the action
 * leaves the page inert / unclickable.
 */
export function CloseModalOnSubmit() {
  const { pending } = useFormStatus();
  const close = useContext(ModalCloseContext);
  const stayOpenOnSubmit = useContext(ModalStayOpenOnSubmitContext);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !stayOpenOnSubmit) {
      close?.();
    }
    wasPending.current = pending;
  }, [pending, close, stayOpenOnSubmit]);

  return null;
}

/**
 * A minimal, dependency-free modal dialog (no Radix — this codebase has no
 * @headlessui/@radix dialog primitive installed, and pulling one in for a
 * single use case wasn't worth it). Renders its trigger inline and, when
 * open, portals the dialog to document.body so it isn't clipped by any
 * scroll container or `overflow-hidden` card.
 */
export function Modal({
  trigger,
  title,
  description,
  children,
  widthClassName = "max-w-lg",
  icon,
  headerClassName,
  defaultOpen = false,
  persistOpenKey,
  overlayZClassName = "z-50",
}: {
  trigger: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
  widthClassName?: string;
  /** Optional icon badge shown to the left of the title. */
  icon?: ReactNode;
  /** Optional class override for the header bar — e.g. a gradient — for
   * modals that want more visual presence than the plain default. */
  headerClassName?: string;
  /** Opens the modal immediately on mount — for a modal that a link
   * elsewhere deep-links straight into via a query param. */
  defaultOpen?: boolean;
  /** When set, an open modal survives a same-page server-action redirect
   * (which otherwise remounts the tree and would close it). Cleared only
   * when the user dismisses the dialog. */
  persistOpenKey?: string;
  /** Raise stacked dialogs (e.g. edit invoice inside Manage unit). */
  overlayZClassName?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [mounted, setMounted] = useState(false);
  const stayOpenOnSubmit = Boolean(persistOpenKey);

  const setOpenAndPersist = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!persistOpenKey) return;
      try {
        if (next) sessionStorage.setItem(persistOpenKey, "1");
        else sessionStorage.removeItem(persistOpenKey);
      } catch {
        /* private mode / disabled storage */
      }
    },
    [persistOpenKey],
  );

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!persistOpenKey) return;
    try {
      if (sessionStorage.getItem(persistOpenKey) === "1") setOpen(true);
    } catch {
      /* ignore */
    }
  }, [persistOpenKey]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenAndPersist(false);
    };
    document.addEventListener("keydown", onKeyDown);
    lockBody();

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      unlockBody();
    };
  }, [open, persistOpenKey, setOpenAndPersist]);

  useEffect(() => {
    if (open || bodyLockCount > 0) return;
    clearNavigationLock();
  }, [open]);

  return (
    <>
      <span onClick={() => setOpenAndPersist(true)} className="contents">
        {trigger}
      </span>

      {mounted && open
        ? createPortal(
            <div
              className={`fixed inset-0 ${overlayZClassName} flex items-center justify-center p-4`}
              style={{ pointerEvents: "auto" }}
            >
              <div
                className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
                onClick={() => setOpenAndPersist(false)}
              />
              <div
                className={`relative z-10 max-h-[90vh] w-full overflow-y-auto rounded-xl border border-border/60 bg-card shadow-2xl ${widthClassName}`}
                role="dialog"
                aria-modal="true"
                style={{ pointerEvents: "auto" }}
              >
                <div
                  className={`flex items-start justify-between gap-3 border-b px-5 py-4 ${
                    headerClassName ??
                    "border-border/60 bg-card"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {icon}
                    <div className="space-y-0.5">
                      <h2 className="text-base font-semibold">{title}</h2>
                      {description && (
                        <p className="text-sm text-muted-foreground">
                          {description}
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpenAndPersist(false)}
                    aria-label="Close"
                    className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-black/5"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="p-5">
                  <ModalStayOpenOnSubmitContext.Provider value={stayOpenOnSubmit}>
                    <ModalCloseContext.Provider value={() => setOpenAndPersist(false)}>
                      {children}
                    </ModalCloseContext.Provider>
                  </ModalStayOpenOnSubmitContext.Provider>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
