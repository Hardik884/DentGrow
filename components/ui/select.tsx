"use client";

import { cn } from "@/lib/utils";
import { Check, ChevronDown } from "lucide-react";
import {
  forwardRef,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

/**
 * Select — DentGrow's dropdown.
 *
 * WHY THIS IS NOT A NATIVE <select>
 *
 * The browser renders a native dropdown's option list itself, using OS chrome
 * that CSS cannot reach. In dark mode that list came out unreadable, and there
 * is no styling fix for it — the popup simply is not ours to style. So the list
 * is rendered as real DOM instead, and it inherits the theme like everything
 * else.
 *
 * WHY THERE IS STILL A <select> IN THE DOM
 *
 * A hidden native <select> remains, and it is the source of truth. Roughly two
 * dozen call sites spread react-hook-form's `register()` straight onto this
 * component, which hands over `ref`, `name`, `onChange` and `onBlur` and
 * expects a real form element on the other end — `valueAsNumber` in particular
 * reads `event.target.value` off it. Forms also submit natively.
 *
 * Picking an option therefore does not just move some React state: it sets the
 * native element's value through the DOM setter and dispatches a genuine
 * bubbling `change` event, so every consumer — controlled `onChange`,
 * react-hook-form, plain form submission — sees exactly the event it saw when
 * this was a plain <select>. The public API is unchanged; call sites did not
 * have to be rewritten.
 */

type OptionItem = {
  value: string;
  label: string;
  disabled?: boolean;
};

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  hasError?: boolean;
}

/**
 * Flattens an option's children into its label.
 *
 * An option is not always a single string: `<option value={d}>{d} min</option>`
 * gives React the array `[15, " min"]`. Reading only a lone string child left
 * those labels empty, so the trigger fell back to its placeholder even though a
 * value was selected.
 */
function readLabel(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(readLabel).join("");
  if (isValidElement(node)) {
    const props = node.props as { children?: ReactNode };
    return readLabel(props?.children);
  }
  return "";
}

/**
 * Reads the `<option>` children into a plain list so the custom popup can
 * render them. Only flat options are supported, which is all this app uses —
 * there are no <optgroup>s anywhere in the codebase.
 */
function readOptions(children: ReactNode): OptionItem[] {
  const items: OptionItem[] = [];

  const walk = (node: ReactNode) => {
    if (node === null || node === undefined || node === false) return;

    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }

    if (!isValidElement(node)) return;

    if (node.type === "option") {
      const props = node.props as {
        value?: string | number;
        children?: ReactNode;
        disabled?: boolean;
      };
      const label = readLabel(props.children).trim();
      items.push({
        value: props.value === undefined ? label : String(props.value),
        label,
        disabled: props.disabled,
      });
      return;
    }

    // Fragments and conditional wrappers.
    const props = node.props as { children?: ReactNode };
    if (props?.children) walk(props.children);
  };

  walk(children);
  return items;
}

/**
 * Sets a <select>'s value the way a user would, so React notices.
 *
 * Assigning `.value` directly is invisible to React: it caches the last value
 * it wrote and skips the change event. Going through the prototype's setter
 * updates React's cached value too, so the dispatched event is delivered to
 * onChange exactly as a real user interaction would be.
 */
function setNativeValue(el: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value",
  )?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      className,
      hasError,
      children,
      id,
      disabled,
      onChange,
      value,
      defaultValue,
      "aria-label": ariaLabel,
      "aria-describedby": ariaDescribedBy,
      ...props
    },
    forwardedRef,
  ) => {
    const options = useMemo(() => readOptions(children), [children]);

    const nativeRef = useRef<HTMLSelectElement | null>(null);
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const listRef = useRef<HTMLDivElement | null>(null);

    const [open, setOpen] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [current, setCurrent] = useState<string>("");
    const [activeIndex, setActiveIndex] = useState(0);
    const [rect, setRect] = useState<{ top: number; left: number; width: number; below: boolean } | null>(null);

    const listboxId = useId();

    useEffect(() => setMounted(true), []);

    // The native element is the source of truth. Re-read it whenever the
    // controlled value or the option set changes — react-hook-form writes
    // straight to the node via its ref, without going through React state.
    useEffect(() => {
      const el = nativeRef.current;
      if (el) setCurrent(el.value);
    }, [value, defaultValue, options]);

    const selected = options.find((o) => o.value === current);

    const attachRef = useCallback(
      (node: HTMLSelectElement | null) => {
        nativeRef.current = node;
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
        if (node) setCurrent(node.value);
      },
      [forwardedRef],
    );

    const position = useCallback(() => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const r = trigger.getBoundingClientRect();
      const spaceBelow = window.innerHeight - r.bottom;
      // Flip above when the list would run off the bottom — matters for the
      // selects that sit near the foot of a tall modal.
      const below = spaceBelow > 240 || spaceBelow > r.top;
      setRect({
        top: below ? r.bottom + 6 : r.top - 6,
        left: r.left,
        width: r.width,
        below,
      });
    }, []);

    useLayoutEffect(() => {
      if (!open) return;
      position();
      const onScroll = () => position();
      // `true` — catch scrolling of any ancestor, since these live inside
      // modals and overflow-auto panels.
      window.addEventListener("scroll", onScroll, true);
      window.addEventListener("resize", onScroll);
      return () => {
        window.removeEventListener("scroll", onScroll, true);
        window.removeEventListener("resize", onScroll);
      };
    }, [open, position]);

    // Open with the current selection highlighted.
    useEffect(() => {
      if (!open) return;
      const i = options.findIndex((o) => o.value === current);
      setActiveIndex(i >= 0 ? i : 0);
    }, [open, options, current]);

    useEffect(() => {
      if (!open) return;
      const onPointerDown = (e: PointerEvent) => {
        const t = e.target as Node;
        if (listRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
        setOpen(false);
      };
      document.addEventListener("pointerdown", onPointerDown, true);
      return () => document.removeEventListener("pointerdown", onPointerDown, true);
    }, [open]);

    // Keep the highlighted row in view while arrowing through a long list
    // (the time pickers have 49 entries).
    useEffect(() => {
      if (!open) return;
      listRef.current
        ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
        ?.scrollIntoView({ block: "nearest" });
    }, [open, activeIndex]);

    const commit = useCallback((next: string) => {
      const el = nativeRef.current;
      if (el && el.value !== next) setNativeValue(el, next);
      setCurrent(next);
      setOpen(false);
      triggerRef.current?.focus();
    }, []);

    const step = useCallback(
      (from: number, dir: 1 | -1) => {
        let i = from;
        for (let n = 0; n < options.length; n++) {
          i = (i + dir + options.length) % options.length;
          if (!options[i]?.disabled) return i;
        }
        return from;
      },
      [options],
    );

    const onTriggerKeyDown = (e: React.KeyboardEvent) => {
      if (disabled) return;

      if (!open) {
        if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) {
          e.preventDefault();
          setOpen(true);
        }
        return;
      }

      switch (e.key) {
        case "Escape":
          e.preventDefault();
          setOpen(false);
          break;
        case "ArrowDown":
          e.preventDefault();
          setActiveIndex((i) => step(i, 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setActiveIndex((i) => step(i, -1));
          break;
        case "Home":
          e.preventDefault();
          setActiveIndex(step(options.length - 1, 1));
          break;
        case "End":
          e.preventDefault();
          setActiveIndex(step(0, -1));
          break;
        case "Enter":
        case " ": {
          e.preventDefault();
          const opt = options[activeIndex];
          if (opt && !opt.disabled) commit(opt.value);
          break;
        }
        case "Tab":
          setOpen(false);
          break;
        default:
          // Typeahead — jump to the first option starting with the key.
          if (e.key.length === 1 && /\S/.test(e.key)) {
            const k = e.key.toLowerCase();
            const i = options.findIndex(
              (o) => !o.disabled && o.label.toLowerCase().startsWith(k),
            );
            if (i >= 0) setActiveIndex(i);
          }
      }
    };

    return (
      <div className="relative">
        {/*
          The real form control. Kept in the DOM for react-hook-form, native
          submission and validation; hidden from sight and from assistive tech,
          which uses the combobox below instead.
        */}
        <select
          ref={attachRef}
          id={id ? `${id}-native` : undefined}
          disabled={disabled}
          value={value}
          defaultValue={defaultValue}
          onChange={(e) => {
            setCurrent(e.target.value);
            onChange?.(e);
          }}
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only pointer-events-none absolute"
          {...props}
        >
          {children}
        </select>

        <button
          ref={triggerRef}
          id={id}
          type="button"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
          aria-label={ariaLabel}
          aria-describedby={ariaDescribedBy}
          disabled={disabled}
          onClick={() => !disabled && setOpen((o) => !o)}
          onKeyDown={onTriggerKeyDown}
          className={cn(
            "flex h-9 w-full items-center justify-between gap-2 rounded-lg border bg-surface px-3 py-2 text-sm",
            "text-left text-text-primary transition-[border-color,box-shadow,background-color] duration-150",
            "cursor-pointer select-none",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25 focus-visible:border-accent",
            "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-disabled",
            hasError
              ? "border-danger focus-visible:ring-danger/25"
              : open
                ? "border-accent ring-2 ring-accent/25"
                : "border-border hover:border-border-strong",
            className,
          )}
        >
          <span className={cn("truncate", !selected?.label && "text-text-disabled")}>
            {selected?.label || "Select…"}
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-text-secondary transition-transform duration-200",
              open && "rotate-180",
            )}
            aria-hidden
          />
        </button>

        {/*
          Rendered into <body> rather than inline. These selects sit inside
          modals and `overflow-auto` panels that would otherwise clip the list
          or trap it below the dialog in the stacking order.
        */}
        {mounted && open && rect
          ? createPortal(
              <div
                ref={listRef}
                id={listboxId}
                role="listbox"
                aria-label={ariaLabel}
                style={{
                  position: "fixed",
                  top: rect.below ? rect.top : undefined,
                  bottom: rect.below ? undefined : window.innerHeight - rect.top,
                  left: rect.left,
                  width: rect.width,
                }}
                className={cn(
                  "z-[100] max-h-60 overflow-y-auto rounded-lg border border-border-strong p-1 shadow-lg",
                  // Explicitly opaque. A dropdown floats over body copy, and
                  // anything less than a solid fill leaves the text underneath
                  // showing through the options. No entrance animation either:
                  // a menu that fades in is a menu you can briefly see through.
                  "bg-surface-secondary",
                )}
              >
                {options.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-text-disabled">No options</p>
                ) : (
                  options.map((opt, i) => {
                    const isSelected = opt.value === current;
                    const isActive = i === activeIndex;
                    return (
                      <div
                        key={`${opt.value}-${i}`}
                        data-index={i}
                        role="option"
                        aria-selected={isSelected}
                        aria-disabled={opt.disabled || undefined}
                        onPointerEnter={() => !opt.disabled && setActiveIndex(i)}
                        onClick={() => !opt.disabled && commit(opt.value)}
                        className={cn(
                          "flex items-center justify-between gap-2 rounded-[6px] px-2.5 py-1.5 text-sm",
                          "transition-colors duration-100",
                          // Disabled rows are usually the "Select a clinic…"
                          // placeholder, which the user still has to read —
                          // text-disabled put it at 2.51:1. Dimmer than an
                          // active row, but legible.
                          opt.disabled
                            ? "cursor-not-allowed text-text-secondary"
                            : "cursor-pointer",
                          !opt.disabled && isActive && "bg-accent-soft text-accent-hover",
                          !opt.disabled && !isActive && "text-text-primary",
                        )}
                      >
                        <span className="truncate">{opt.label}</span>
                        {isSelected && (
                          <Check className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
                        )}
                      </div>
                    );
                  })
                )}
              </div>,
              document.body,
            )
          : null}
      </div>
    );
  },
);

Select.displayName = "Select";
