import type { FlowParams, FpsLimitMode, LookParams, RenderParams, TopologyParams, UiParams } from "../types";

export interface ControlPanelState {
  flow: FlowParams;
  topology: TopologyParams;
  look: LookParams;
  render: RenderParams;
  ui: UiParams;
}

export interface ControlCallbacks {
  onLiveChange(): void;
  onSimulationRebuild(): void;
  onSaveLayout(): void;
  onResetLayout(): void;
}

export interface ControlPanelApi {
  setStatus(text: string, kind?: "info" | "error"): void;
  setFps(fps: number): void;
  dispose(): void;
}

interface RangeSpec {
  label: string;
  min: number;
  max: number;
  step: number;
  precision: number;
  suffix?: string;
  commitOnly?: boolean;
}

type NumericKeys<T> = {
  [K in keyof T]-?: T[K] extends number ? K : never;
}[keyof T];

type BooleanKeys<T> = {
  [K in keyof T]-?: T[K] extends boolean ? K : never;
}[keyof T];

type StringKeys<T> = {
  [K in keyof T]-?: T[K] extends string ? K : never;
}[keyof T];

type TabKey = "flow" | "topology" | "look" | "render" | "ui";

function requireElement<T extends HTMLElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing required control element: ${selector}`);
  }
  return element;
}

function formatValue(value: number, precision: number, suffix = ""): string {
  return `${value.toFixed(precision)}${suffix}`;
}

function createFolder(title: string, open = true): HTMLDetailsElement {
  const details = document.createElement("details");
  details.className = "folder";
  details.open = open;

  const summary = document.createElement("summary");
  summary.textContent = title;
  details.appendChild(summary);

  const body = document.createElement("div");
  body.className = "folder-body";
  details.appendChild(body);
  return details;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function parseCssPx(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseCssRadiusPx(value: string, fallback: number): number {
  const normalized = value.trim().split(" ")[0] ?? "";
  return parseCssPx(normalized, fallback);
}

function normalizeHexColor(value: string, fallback: string): string {
  const trimmed = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(trimmed)) {
    return trimmed;
  }
  if (/^#[0-9a-f]{3}$/.test(trimmed)) {
    return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
  }
  return fallback;
}

function hexToRgbChannels(hex: string): { r: number; g: number; b: number } {
  const normalized = normalizeHexColor(hex, "#ffffff").slice(1);
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function rgbChannelsToHex(r: number, g: number, b: number): string {
  const toHex = (value: number): string => Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function applyHexSaturation(hex: string, saturation: number): string {
  const { r, g, b } = hexToRgbChannels(hex);
  const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
  return rgbChannelsToHex(
    luma + (r - luma) * saturation,
    luma + (g - luma) * saturation,
    luma + (b - luma) * saturation,
  );
}

function createSelectRow<T extends string>(
  labelText: string,
  options: Array<{ label: string; value: T }>,
  initialValue: T,
  onValue: (value: T) => void,
  cleanup: Array<() => void>,
): HTMLDivElement {
  const row = document.createElement("div");
  row.className = "control-row";

  const label = document.createElement("label");
  label.className = "control-label";
  label.textContent = labelText;

  const selectRoot = document.createElement("div");
  selectRoot.className = "control-select";
  selectRoot.dataset.open = "false";
  selectRoot.dataset.direction = "down";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "control-select-trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");

  const valueElement = document.createElement("span");
  valueElement.className = "control-select-value";
  trigger.appendChild(valueElement);

  const menu = document.createElement("div");
  menu.className = "control-select-menu";
  menu.setAttribute("role", "listbox");

  const resolveOption = (value: T): { label: string; value: T } => options.find((option) => option.value === value) ?? options[0];
  let currentValue = resolveOption(initialValue).value;
  const optionButtons: Array<{ value: T; element: HTMLButtonElement }> = [];
  const getScrollHost = (): HTMLElement | null => selectRoot.closest<HTMLElement>(".tabs-panels");

  const updatePlacement = (): void => {
    const previousOpen = selectRoot.dataset.open;
    const previousVisibility = menu.style.visibility;
    const previousPointerEvents = menu.style.pointerEvents;

    if (previousOpen !== "true") {
      selectRoot.dataset.open = "true";
      menu.style.visibility = "hidden";
      menu.style.pointerEvents = "none";
    }

    const scrollHost = getScrollHost();
    const hostRect = scrollHost instanceof HTMLElement
      ? scrollHost.getBoundingClientRect()
      : document.documentElement.getBoundingClientRect();
    const triggerRect = trigger.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const menuHeight = Math.max(menuRect.height, menu.scrollHeight, 0);
    const gutter = 10;
    const availableBelow = Math.max(0, hostRect.bottom - triggerRect.bottom - gutter);
    const availableAbove = Math.max(0, triggerRect.top - hostRect.top - gutter);
    const openUp = menuHeight > availableBelow && availableAbove > availableBelow;
    const maxHeight = Math.max(96, Math.min(openUp ? availableAbove : availableBelow, 320));

    selectRoot.dataset.direction = openUp ? "up" : "down";
    menu.style.maxHeight = `${maxHeight.toFixed(0)}px`;

    if (previousOpen !== "true") {
      selectRoot.dataset.open = previousOpen ?? "false";
      menu.style.visibility = previousVisibility;
      menu.style.pointerEvents = previousPointerEvents;
    }
  };

  const setOpen = (open: boolean): void => {
    if (open) {
      updatePlacement();
    }
    selectRoot.dataset.open = open ? "true" : "false";
    trigger.setAttribute("aria-expanded", open ? "true" : "false");
  };

  const setValue = (value: T, emit: boolean): void => {
    const option = resolveOption(value);
    currentValue = option.value;
    valueElement.textContent = option.label;
    for (const optionButton of optionButtons) {
      const selected = optionButton.value === currentValue;
      optionButton.element.dataset.selected = selected ? "true" : "false";
      optionButton.element.setAttribute("aria-selected", selected ? "true" : "false");
    }
    if (emit) {
      onValue(currentValue);
    }
  };

  for (const option of options) {
    const optionButton = document.createElement("button");
    optionButton.type = "button";
    optionButton.className = "control-select-option";
    optionButton.textContent = option.label;
    optionButton.dataset.selected = "false";
    optionButton.setAttribute("role", "option");
    optionButton.setAttribute("aria-selected", "false");

    const onOptionClick = (): void => {
      setValue(option.value, true);
      setOpen(false);
      trigger.focus();
    };

    optionButton.addEventListener("click", onOptionClick);
    cleanup.push(() => optionButton.removeEventListener("click", onOptionClick));
    optionButtons.push({ value: option.value, element: optionButton });
    menu.appendChild(optionButton);
  }

  const onTriggerClick = (): void => {
    setOpen(selectRoot.dataset.open !== "true");
  };

  const onTriggerKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen(selectRoot.dataset.open !== "true");
      return;
    }
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }

    event.preventDefault();
    const currentIndex = options.findIndex((option) => option.value === currentValue);
    const fallbackIndex = currentIndex >= 0 ? currentIndex : 0;
    const direction = event.key === "ArrowDown" ? 1 : -1;
    const nextIndex = (fallbackIndex + direction + options.length) % options.length;
    setValue(options[nextIndex].value, true);
  };

  const onDocumentPointerDown = (event: PointerEvent): void => {
    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }
    if (!selectRoot.contains(target)) {
      setOpen(false);
    }
  };

  const onWindowResize = (): void => {
    if (selectRoot.dataset.open === "true") {
      updatePlacement();
    }
  };

  const onScrollHostScroll = (): void => {
    if (selectRoot.dataset.open === "true") {
      updatePlacement();
    }
  };

  trigger.addEventListener("click", onTriggerClick);
  trigger.addEventListener("keydown", onTriggerKeyDown);
  document.addEventListener("pointerdown", onDocumentPointerDown);
  window.addEventListener("resize", onWindowResize);
  if (getScrollHost() instanceof HTMLElement) {
    getScrollHost()?.addEventListener("scroll", onScrollHostScroll, { passive: true });
  }
  cleanup.push(() => trigger.removeEventListener("click", onTriggerClick));
  cleanup.push(() => trigger.removeEventListener("keydown", onTriggerKeyDown));
  cleanup.push(() => document.removeEventListener("pointerdown", onDocumentPointerDown));
  cleanup.push(() => window.removeEventListener("resize", onWindowResize));
  if (getScrollHost() instanceof HTMLElement) {
    cleanup.push(() => getScrollHost()?.removeEventListener("scroll", onScrollHostScroll));
  }

  setValue(initialValue, false);

  selectRoot.appendChild(trigger);
  selectRoot.appendChild(menu);
  row.appendChild(label);
  row.appendChild(selectRoot);
  return row;
}
export function createControlPanel(
  root: HTMLElement,
  state: ControlPanelState,
  callbacks: ControlCallbacks,
): ControlPanelApi {
  root.innerHTML = `
    <div class="panel-dock" data-ui-hidden="false">
      <section class="panel">
        <div class="panel-head">
          <h1 class="title">${state.ui.mainTitle}</h1>
          <div class="project-description" aria-label="Project description">
            <p class="project-description-line">Reference-driven 2D flow field.</p>
            <p class="project-description-line">Procedural reconstruction.</p>
          </div>
          <p id="status-line" class="status">Building reference field.</p>
          <div id="tabs-nav-slot" class="tabs-nav-slot"></div>
        </div>
        <div id="folders-root" class="folders-root"></div>
      </section>
      <button id="ui-visibility-btn" class="ui-visibility-btn" type="button" aria-label="Hide UI">
        <span class="ui-visibility-icon" aria-hidden="true"></span>
      </button>
    </div>
    <div class="hint-row">
      <div id="fps-readout" class="fps-readout">FPS: --</div>
      <div class="hint">Select: click | Move: drag | Radius: wheel or Shift-drag</div>
    </div>
  `;

  if (!root.dataset.uiDepth) {
    root.dataset.uiDepth = "medium";
  }

  const cleanup: Array<() => void> = [];
  const documentStyle = document.documentElement.style;
  const panelDock = requireElement<HTMLDivElement>(root, ".panel-dock");
  const panelElement = requireElement<HTMLElement>(root, ".panel");
  const panelHeadElement = requireElement<HTMLElement>(root, ".panel-head");
  const titleElement = requireElement<HTMLHeadingElement>(root, ".title");
  const projectDescriptionElement = requireElement<HTMLDivElement>(root, ".project-description");
  const hintRowElement = requireElement<HTMLDivElement>(root, ".hint-row");
  const uiVisibilityButton = requireElement<HTMLButtonElement>(root, "#ui-visibility-btn");
  const statusLine = requireElement<HTMLParagraphElement>(root, "#status-line");
  const fpsReadout = requireElement<HTMLDivElement>(root, "#fps-readout");
  const tabsNavSlot = requireElement<HTMLDivElement>(root, "#tabs-nav-slot");
  const foldersRoot = requireElement<HTMLDivElement>(root, "#folders-root");
  const tabsNav = document.createElement("div");
  tabsNav.className = "tabs-nav";
  const tabsPanels = document.createElement("div");
  tabsPanels.className = "tabs-panels";

  const panelScrollbar = document.createElement("div");
  panelScrollbar.className = "panel-scrollbar";
  panelScrollbar.setAttribute("aria-hidden", "true");
  panelScrollbar.dataset.hidden = "true";

  const panelScrollbarThumb = document.createElement("div");
  panelScrollbarThumb.className = "panel-scrollbar-thumb";
  panelScrollbarThumb.dataset.dragging = "false";
  panelScrollbar.appendChild(panelScrollbarThumb);
  panelElement.appendChild(panelScrollbar);

  const tabButtons = {} as Record<TabKey, HTMLButtonElement>;
  const tabPanels = {} as Record<TabKey, HTMLDivElement>;

  let uiHidden = false;
  let hintPositionRafId = 0;
  let scrollbarAnchorRafId = 0;
  let scrollbarDragPointerId: number | null = null;
  let scrollbarDragStartClientY = 0;
  let scrollbarDragStartScrollTop = 0;

  const updateHintPosition = (): void => {
    if (uiHidden || !root.isConnected || !panelElement.isConnected || !hintRowElement.isConnected) {
      return;
    }

    const rootRect = root.getBoundingClientRect();
    if (rootRect.width <= 0) {
      return;
    }

    const panelRect = panelElement.getBoundingClientRect();
    const panelRight = Math.max(0, Math.min(rootRect.width, panelRect.right - rootRect.left));
    const hintCenterX = panelRight + (rootRect.width - panelRight) * 0.5;
    root.style.setProperty("--hint-center-x", `${hintCenterX.toFixed(1)}px`);
  };

  const scheduleHintPositionUpdate = (): void => {
    if (hintPositionRafId !== 0) {
      window.cancelAnimationFrame(hintPositionRafId);
    }
    hintPositionRafId = window.requestAnimationFrame(() => {
      hintPositionRafId = 0;
      updateHintPosition();
    });
  };

  const getScrollbarMetrics = (): {
    scrollRange: number;
    trackHeight: number;
    thumbSize: number;
    maxThumbOffset: number;
  } | null => {
    const scrollRange = tabsPanels.scrollHeight - tabsPanels.clientHeight;
    const trackHeight = panelScrollbar.clientHeight;
    if (scrollRange <= 0 || trackHeight <= 0 || tabsPanels.clientHeight <= 0) {
      return null;
    }

    const thumbSize = clamp((tabsPanels.clientHeight / tabsPanels.scrollHeight) * trackHeight, 26, trackHeight);
    const maxThumbOffset = Math.max(trackHeight - thumbSize, 0);
    return { scrollRange, trackHeight, thumbSize, maxThumbOffset };
  };

  const updateCustomScrollbarThumb = (): void => {
    const metrics = getScrollbarMetrics();
    if (uiHidden || !metrics) {
      panelScrollbar.dataset.hidden = "true";
      panelScrollbarThumb.style.height = "";
      panelScrollbarThumb.style.transform = "translateY(0)";
      return;
    }

    panelScrollbar.dataset.hidden = "false";
    const scrollRatio = clamp(tabsPanels.scrollTop / metrics.scrollRange, 0, 1);
    const thumbOffset = metrics.maxThumbOffset * scrollRatio;
    panelScrollbarThumb.style.height = `${metrics.thumbSize.toFixed(1)}px`;
    panelScrollbarThumb.style.transform = `translateY(${thumbOffset.toFixed(1)}px)`;
  };

  const updateScrollbarTrackAnchors = (): void => {
    if (!tabsPanels.isConnected) {
      return;
    }

    const panelRect = panelElement.getBoundingClientRect();
    const panelHeadRect = panelHeadElement.getBoundingClientRect();
    const tabsPanelsRect = tabsPanels.getBoundingClientRect();
    const panelStyles = getComputedStyle(panelElement);
    const tabsPanelsStyles = getComputedStyle(tabsPanels);
    if (panelRect.height <= 0 || tabsPanelsRect.height <= 0 || panelHeadRect.height <= 0) {
      return;
    }

    const tabsPaddingTop = parseCssPx(tabsPanelsStyles.paddingTop, 0);
    const tabsPaddingBottom = parseCssPx(tabsPanelsStyles.paddingBottom, 0);
    const topInset = panelHeadRect.bottom - panelRect.top + tabsPaddingTop;
    const bottomInset = panelRect.bottom - tabsPanelsRect.bottom + tabsPaddingBottom;
    const topRightRadius = parseCssRadiusPx(panelStyles.borderTopRightRadius, 0);
    const bottomRightRadius = parseCssRadiusPx(panelStyles.borderBottomRightRadius, 0);
    const topOffset = clamp(Math.max(topInset, topRightRadius), 0, panelRect.height * 0.46);
    const bottomOffset = clamp(Math.max(bottomInset, bottomRightRadius), 0, panelRect.height * 0.46);

    documentStyle.setProperty("--ui-scrollbar-top-offset", `${topOffset.toFixed(1)}px`);
    documentStyle.setProperty("--ui-scrollbar-bottom-offset", `${bottomOffset.toFixed(1)}px`);
    updateCustomScrollbarThumb();
  };

  const scheduleScrollbarTrackAnchorsUpdate = (syncHint = true): void => {
    if (scrollbarAnchorRafId !== 0) {
      window.cancelAnimationFrame(scrollbarAnchorRafId);
    }
    scrollbarAnchorRafId = window.requestAnimationFrame(() => {
      scrollbarAnchorRafId = 0;
      updateScrollbarTrackAnchors();
      if (syncHint) {
        updateHintPosition();
      }
    });
  };

  const stopScrollbarThumbDrag = (pointerId?: number): void => {
    if (scrollbarDragPointerId === null) {
      return;
    }
    if (pointerId !== undefined && pointerId !== scrollbarDragPointerId) {
      return;
    }

    const activePointerId = scrollbarDragPointerId;
    scrollbarDragPointerId = null;
    panelScrollbarThumb.dataset.dragging = "false";
    if (panelScrollbarThumb.hasPointerCapture(activePointerId)) {
      panelScrollbarThumb.releasePointerCapture(activePointerId);
    }
  };

  const onScrollbarThumbPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || !getScrollbarMetrics()) {
      return;
    }
    event.preventDefault();
    scrollbarDragPointerId = event.pointerId;
    scrollbarDragStartClientY = event.clientY;
    scrollbarDragStartScrollTop = tabsPanels.scrollTop;
    panelScrollbarThumb.dataset.dragging = "true";
    panelScrollbarThumb.setPointerCapture(event.pointerId);
  };

  const onScrollbarThumbPointerMove = (event: PointerEvent): void => {
    if (scrollbarDragPointerId === null || event.pointerId !== scrollbarDragPointerId) {
      return;
    }

    const metrics = getScrollbarMetrics();
    if (!metrics || metrics.maxThumbOffset <= 0 || metrics.scrollRange <= 0) {
      return;
    }

    event.preventDefault();
    const deltaY = event.clientY - scrollbarDragStartClientY;
    const scrollDelta = (deltaY / metrics.maxThumbOffset) * metrics.scrollRange;
    tabsPanels.scrollTop = clamp(scrollbarDragStartScrollTop + scrollDelta, 0, metrics.scrollRange);
    updateCustomScrollbarThumb();
  };

  const onScrollbarThumbPointerUp = (event: PointerEvent): void => stopScrollbarThumbDrag(event.pointerId);
  const onScrollbarThumbPointerCancel = (event: PointerEvent): void => stopScrollbarThumbDrag(event.pointerId);
  const onScrollbarThumbLostPointerCapture = (event: PointerEvent): void => stopScrollbarThumbDrag(event.pointerId);

  panelScrollbarThumb.addEventListener("pointerdown", onScrollbarThumbPointerDown);
  panelScrollbarThumb.addEventListener("pointermove", onScrollbarThumbPointerMove);
  panelScrollbarThumb.addEventListener("pointerup", onScrollbarThumbPointerUp);
  panelScrollbarThumb.addEventListener("pointercancel", onScrollbarThumbPointerCancel);
  panelScrollbarThumb.addEventListener("lostpointercapture", onScrollbarThumbLostPointerCapture);
  cleanup.push(() => panelScrollbarThumb.removeEventListener("pointerdown", onScrollbarThumbPointerDown));
  cleanup.push(() => panelScrollbarThumb.removeEventListener("pointermove", onScrollbarThumbPointerMove));
  cleanup.push(() => panelScrollbarThumb.removeEventListener("pointerup", onScrollbarThumbPointerUp));
  cleanup.push(() => panelScrollbarThumb.removeEventListener("pointercancel", onScrollbarThumbPointerCancel));
  cleanup.push(() => panelScrollbarThumb.removeEventListener("lostpointercapture", onScrollbarThumbLostPointerCapture));
  cleanup.push(() => stopScrollbarThumbDrag());

  const setActiveTab = (activeKey: TabKey): void => {
    const keys = Object.keys(tabButtons) as TabKey[];
    tabsNav.style.gridTemplateColumns = `repeat(${Math.max(1, keys.length)}, minmax(0, 1fr))`;
    for (const key of keys) {
      const isActive = key === activeKey;
      tabButtons[key].dataset.active = isActive ? "true" : "false";
      tabPanels[key].hidden = !isActive;
    }
    scheduleScrollbarTrackAnchorsUpdate();
  };

  const createTab = (key: TabKey, labelText: string): HTMLDivElement => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tab-button";
    button.textContent = labelText;

    const panel = document.createElement("div");
    panel.className = "tab-panel";
    panel.hidden = true;

    const onClick = (): void => {
      tabsPanels.scrollTop = 0;
      setActiveTab(key);
    };

    button.addEventListener("click", onClick);
    cleanup.push(() => button.removeEventListener("click", onClick));

    tabButtons[key] = button;
    tabPanels[key] = panel;
    tabsNav.appendChild(button);
    tabsPanels.appendChild(panel);
    return panel;
  };
  const bindRange = <T extends object, K extends NumericKeys<T>>(
    body: HTMLElement,
    target: T,
    key: K,
    spec: RangeSpec,
    onNotify: () => void,
  ): void => {
    const row = document.createElement("div");
    row.className = "control-row";

    const label = document.createElement("label");
    label.className = "control-label";
    label.textContent = spec.label;

    const output = document.createElement("output");
    output.className = "control-value";

    const input = document.createElement("input");
    input.type = "range";
    input.min = String(spec.min);
    input.max = String(spec.max);
    input.step = String(spec.step);
    input.value = String(target[key]);

    const setRangeProgress = (): void => {
      const min = Number.parseFloat(input.min);
      const max = Number.parseFloat(input.max);
      const current = Number.parseFloat(input.value);
      const span = max - min;
      const progress = span > 0 ? (current - min) / span : 0;
      const clamped = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
      input.style.setProperty("--range-progress", `${(clamped * 100).toFixed(2)}%`);
    };

    const applyValue = (): void => {
      const numericValue = Number(input.value);
      target[key] = numericValue as T[K];
      output.textContent = formatValue(numericValue, spec.precision, spec.suffix);
      setRangeProgress();
    };

    const onInput = (): void => {
      applyValue();
      if (!spec.commitOnly) {
        onNotify();
      }
    };

    const onChange = (): void => {
      applyValue();
      if (spec.commitOnly) {
        onNotify();
      }
    };

    output.textContent = formatValue(Number(input.value), spec.precision, spec.suffix);
    setRangeProgress();
    input.addEventListener("input", onInput);
    input.addEventListener("change", onChange);
    cleanup.push(() => input.removeEventListener("input", onInput));
    cleanup.push(() => input.removeEventListener("change", onChange));

    row.appendChild(label);
    row.appendChild(output);
    row.appendChild(input);
    body.appendChild(row);
  };

  const bindCheckbox = <T extends object, K extends BooleanKeys<T>>(
    body: HTMLElement,
    target: T,
    key: K,
    labelText: string,
    onNotify: () => void,
  ): void => {
    const row = document.createElement("label");
    row.className = "checkbox-row";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "checkbox-input";
    input.checked = Boolean(target[key]);

    const toggle = document.createElement("span");
    toggle.className = "checkbox-toggle";
    toggle.setAttribute("aria-hidden", "true");

    const text = document.createElement("span");
    text.className = "checkbox-label";
    text.textContent = labelText;

    const onChange = (): void => {
      target[key] = input.checked as T[K];
      onNotify();
    };

    input.addEventListener("change", onChange);
    cleanup.push(() => input.removeEventListener("change", onChange));

    row.appendChild(input);
    row.appendChild(toggle);
    row.appendChild(text);
    body.appendChild(row);
  };

  const bindSelect = <T extends object, K extends StringKeys<T>>(
    body: HTMLElement,
    target: T,
    key: K,
    labelText: string,
    options: Array<{ label: string; value: T[K] & string }>,
    onNotify: () => void,
  ): void => {
    body.appendChild(
      createSelectRow(
        labelText,
        options,
        target[key] as T[K] & string,
        (value): void => {
          target[key] = value as T[K];
          onNotify();
        },
        cleanup,
      ),
    );
  };

  const bindColor = <T extends object, K extends StringKeys<T>>(
    body: HTMLElement,
    target: T,
    key: K,
    labelText: string,
    onNotify: () => void,
  ): void => {
    const row = document.createElement("div");
    row.className = "control-row";

    const label = document.createElement("label");
    label.className = "control-label";
    label.textContent = labelText;

    const input = document.createElement("input");
    input.type = "color";
    input.className = "control-color";
    input.value = normalizeHexColor(String(target[key]), "#ffffff");

    const onInput = (): void => {
      target[key] = input.value as T[K];
      onNotify();
    };

    input.addEventListener("input", onInput);
    cleanup.push(() => input.removeEventListener("input", onInput));

    row.appendChild(label);
    row.appendChild(input);
    body.appendChild(row);
  };

  const bindTextField = <T extends object, K extends StringKeys<T>>(
    body: HTMLElement,
    target: T,
    key: K,
    labelText: string,
    onNotify: () => void,
    options?: { multiline?: boolean; rows?: number; placeholder?: string },
  ): void => {
    const row = document.createElement("div");
    row.className = "control-row";

    const label = document.createElement("label");
    label.className = "control-label";
    label.textContent = labelText;
    row.appendChild(label);

    if (options?.multiline) {
      const textarea = document.createElement("textarea");
      textarea.className = "control-textarea";
      textarea.rows = options.rows ?? 3;
      textarea.value = String(target[key]);
      if (options.placeholder) {
        textarea.placeholder = options.placeholder;
      }

      const onInput = (): void => {
        target[key] = textarea.value as T[K];
        onNotify();
      };

      textarea.addEventListener("input", onInput);
      cleanup.push(() => textarea.removeEventListener("input", onInput));
      row.appendChild(textarea);
      body.appendChild(row);
      return;
    }

    const input = document.createElement("input");
    input.type = "text";
    input.className = "control-text";
    input.value = String(target[key]);
    if (options?.placeholder) {
      input.placeholder = options.placeholder;
    }

    const onInput = (): void => {
      target[key] = input.value as T[K];
      onNotify();
    };

    input.addEventListener("input", onInput);
    cleanup.push(() => input.removeEventListener("input", onInput));
    row.appendChild(input);
    body.appendChild(row);
  };

  const bindActionButton = (
    body: HTMLElement,
    labelText: string,
    onAction: () => void,
  ): void => {
    const row = document.createElement("div");
    row.className = "control-row";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "control-select-trigger";
    button.textContent = labelText;

    button.addEventListener("click", onAction);
    cleanup.push(() => button.removeEventListener("click", onAction));

    row.appendChild(button);
    body.appendChild(row);
  };

  const syncScrollbarFit = (): void => {
    const scale = clamp(state.ui.scale, 0.75, 1.6);
    const bevel = clamp(state.ui.bevelStrength, 0.6, 1.8);
    const sizePx = clamp(6.8 * scale, 6, 11);
    const topOffsetPx = clamp((4.5 + (bevel - 1) * 5.2) * scale, 4, 14);
    const bottomOffsetPx = clamp((11 + (bevel - 1) * 8) * scale, 10, 26);
    const thumbMinPx = clamp((34 + (bevel - 1) * 12) * scale, 26, 54);
    const panelStyles = getComputedStyle(panelElement);
    const panelInlinePadPx = Number.parseFloat(panelStyles.paddingRight);
    const rightOffsetPx = clamp(((Number.isFinite(panelInlinePadPx) ? panelInlinePadPx : 15) - sizePx) * 0.5, 0, 40);

    documentStyle.setProperty("--ui-scrollbar-size", `${sizePx.toFixed(1)}px`);
    documentStyle.setProperty("--ui-scrollbar-right-offset", `${rightOffsetPx.toFixed(1)}px`);
    documentStyle.setProperty("--ui-scrollbar-top-offset", `${topOffsetPx.toFixed(1)}px`);
    documentStyle.setProperty("--ui-scrollbar-bottom-offset", `${bottomOffsetPx.toFixed(1)}px`);
    documentStyle.setProperty("--ui-scrollbar-thumb-min", `${thumbMinPx.toFixed(1)}px`);
  };

  const applyProjectTitle = (): void => {
    const normalized = state.ui.mainTitle.trim();
    titleElement.textContent = normalized.length > 0 ? normalized : "FLOW MATTER";
  };

  const applyProjectDescription = (): void => {
    const normalized = state.ui.description.replace(/\r\n/g, "\n");
    const lines = normalized.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
    const finalLines = lines.length > 0 ? lines : ["Reference-driven 2D flow field.", "Procedural reconstruction."];

    while (projectDescriptionElement.firstChild) {
      projectDescriptionElement.removeChild(projectDescriptionElement.firstChild);
    }

    for (const line of finalLines) {
      const lineElement = document.createElement("p");
      lineElement.className = "project-description-line";
      lineElement.textContent = line;
      projectDescriptionElement.appendChild(lineElement);
    }
  };

  const applyUiThemeSettings = (): void => {
    const saturation = clamp(state.ui.saturation, 0, 2);
    const textColor = applyHexSaturation(normalizeHexColor(state.ui.textColor, "#d5deeb"), saturation);
    const folderNameColor = applyHexSaturation(normalizeHexColor(state.ui.folderNameColor, "#d2dbe9"), saturation);
    const mainColor = applyHexSaturation(normalizeHexColor(state.ui.mainColor, "#3a3b42"), saturation);
    const headColor = applyHexSaturation(normalizeHexColor(state.ui.headColor, "#26303d"), saturation);
    const accentColor = applyHexSaturation(normalizeHexColor(state.ui.accentColor, "#a8d2ff"), saturation);
    const sliderFillColor = applyHexSaturation(normalizeHexColor(state.ui.sliderFillColor, accentColor), saturation);
    const scrollbarColor = applyHexSaturation(normalizeHexColor(state.ui.scrollbarColor, "#97a3b4"), saturation);
    const textRgb = hexToRgbChannels(textColor);
    const accentRgb = hexToRgbChannels(accentColor);

    root.dataset.uiDepth = state.ui.depth;
    documentStyle.setProperty("--text", textColor);
    documentStyle.setProperty("--muted", `rgba(${textRgb.r}, ${textRgb.g}, ${textRgb.b}, 0.72)`);
    documentStyle.setProperty("--folder-title-color", folderNameColor);
    documentStyle.setProperty("--ui-main-color", mainColor);
    documentStyle.setProperty("--panel-head-color", headColor);
    documentStyle.setProperty("--head-folder-lightness", clamp(state.ui.headLightness, 0.7, 1.35).toFixed(2));
    documentStyle.setProperty("--accent", accentColor);
    documentStyle.setProperty("--line", `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.18)`);
    documentStyle.setProperty("--line-strong", `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.32)`);
    documentStyle.setProperty("--slider-fill", sliderFillColor);
    documentStyle.setProperty("--ui-scrollbar-color", scrollbarColor);
    documentStyle.setProperty("--ui-scale", clamp(state.ui.scale, 0.75, 1.6).toFixed(2));
    documentStyle.setProperty("--ui-width-scale", clamp(state.ui.widthScale, 0.6, 1.8).toFixed(2));
    documentStyle.setProperty("--ui-bevel-strength", clamp(state.ui.bevelStrength, 0.6, 1.8).toFixed(2));
    documentStyle.setProperty("--menu-section-gap", `${clamp(state.ui.menuSectionGap, 0.2, 1.8).toFixed(2)}rem`);
    documentStyle.setProperty("--panel-content-pad-top", `${clamp(state.ui.menuPaddingTop, 0, 2).toFixed(2)}rem`);
    documentStyle.setProperty("--panel-content-pad-bottom", `${clamp(state.ui.menuPaddingBottom, 0, 2).toFixed(2)}rem`);

    applyProjectTitle();
    applyProjectDescription();
    syncScrollbarFit();
    updateCustomScrollbarThumb();
    scheduleScrollbarTrackAnchorsUpdate();
    scheduleHintPositionUpdate();
  };

  const onUiChange = (): void => {
    applyUiThemeSettings();
    callbacks.onLiveChange();
  };

  createTab("flow", "Flow");
  createTab("topology", "Topology");
  createTab("look", "Look");
  createTab("render", "Render");
  createTab("ui", "UI");
  const flowFolder = createFolder("FLOW", true);
  const flowBody = requireElement<HTMLDivElement>(flowFolder, ".folder-body");
  bindRange(flowBody, state.flow, "particleCount", {
    label: "Particle Count",
    min: 1200,
    max: 12000,
    step: 100,
    precision: 0,
    commitOnly: true,
  }, callbacks.onSimulationRebuild);
  bindRange(flowBody, state.flow, "trailLength", {
    label: "Trail Length",
    min: 8,
    max: 128,
    step: 1,
    precision: 0,
    commitOnly: true,
  }, callbacks.onSimulationRebuild);
  bindRange(flowBody, state.flow, "integrationStep", {
    label: "Integration Step",
    min: 0.004,
    max: 0.03,
    step: 0.001,
    precision: 3,
  }, callbacks.onLiveChange);
  bindRange(flowBody, state.flow, "particleLife", {
    label: "Particle Life",
    min: 1,
    max: 12,
    step: 0.1,
    precision: 1,
    suffix: "s",
  }, callbacks.onLiveChange);
  bindRange(flowBody, state.flow, "respawnJitter", {
    label: "Respawn Jitter",
    min: 0,
    max: 0.08,
    step: 0.001,
    precision: 3,
  }, callbacks.onLiveChange);
  bindRange(flowBody, state.flow, "loopSpeed", {
    label: "Loop Speed",
    min: 0,
    max: 2,
    step: 0.01,
    precision: 2,
  }, callbacks.onLiveChange);
  bindRange(flowBody, state.flow, "loopAmount", {
    label: "Loop Amount",
    min: 0,
    max: 0.35,
    step: 0.01,
    precision: 2,
  }, callbacks.onLiveChange);

  const topologyFolder = createFolder("TOPOLOGY", true);
  const topologyBody = requireElement<HTMLDivElement>(topologyFolder, ".folder-body");
  bindRange(topologyBody, state.topology, "voidRadiusScale", {
    label: "Void Radius Scale",
    min: 0.6,
    max: 1.6,
    step: 0.01,
    precision: 2,
  }, callbacks.onLiveChange);
  bindRange(topologyBody, state.topology, "voidRepel", {
    label: "Void Repel",
    min: 0,
    max: 3,
    step: 0.01,
    precision: 2,
  }, callbacks.onLiveChange);
  bindRange(topologyBody, state.topology, "ringVorticity", {
    label: "Ring Vorticity",
    min: 0,
    max: 6,
    step: 0.01,
    precision: 2,
  }, callbacks.onLiveChange);
  bindRange(topologyBody, state.topology, "ringWidth", {
    label: "Ring Width",
    min: 0.02,
    max: 0.18,
    step: 0.002,
    precision: 3,
  }, callbacks.onLiveChange);
  bindRange(topologyBody, state.topology, "channelPull", {
    label: "Channel Pull",
    min: 0,
    max: 3,
    step: 0.01,
    precision: 2,
  }, callbacks.onLiveChange);
  bindRange(topologyBody, state.topology, "channelFlow", {
    label: "Channel Flow",
    min: 0,
    max: 4,
    step: 0.01,
    precision: 2,
  }, callbacks.onLiveChange);
  bindRange(topologyBody, state.topology, "sideInflow", {
    label: "Side Inflow",
    min: 0,
    max: 4,
    step: 0.01,
    precision: 2,
  }, callbacks.onLiveChange);
  bindRange(topologyBody, state.topology, "spineStrength", {
    label: "Spine Strength",
    min: 0,
    max: 2,
    step: 0.01,
    precision: 2,
  }, callbacks.onLiveChange);
  bindRange(topologyBody, state.topology, "edgeFade", {
    label: "Edge Fade",
    min: 0,
    max: 2,
    step: 0.01,
    precision: 2,
  }, callbacks.onLiveChange);
  bindRange(topologyBody, state.topology, "backgroundCurl", {
    label: "Background Curl",
    min: 0,
    max: 1,
    step: 0.01,
    precision: 2,
  }, callbacks.onLiveChange);
  bindRange(topologyBody, state.topology, "backgroundNoiseScale", {
    label: "Noise Scale",
    min: 0.2,
    max: 3,
    step: 0.01,
    precision: 2,
  }, callbacks.onLiveChange);
  bindRange(topologyBody, state.topology, "backgroundNoiseSpeed", {
    label: "Noise Speed",
    min: 0,
    max: 3,
    step: 0.01,
    precision: 2,
  }, callbacks.onLiveChange);
  const layoutFolder = createFolder("LAYOUT EDIT", true);
  const layoutBody = requireElement<HTMLDivElement>(layoutFolder, ".folder-body");
  bindActionButton(layoutBody, "Save Layout", callbacks.onSaveLayout);
  bindActionButton(layoutBody, "Reset Layout", callbacks.onResetLayout);

  const lookFolder = createFolder("LOOK", true);
  const lookBody = requireElement<HTMLDivElement>(lookFolder, ".folder-body");
  bindColor(lookBody, state.look, "backgroundColor", "Background", callbacks.onLiveChange);
  bindColor(lookBody, state.look, "lineColor", "Line Color", callbacks.onLiveChange);
  bindColor(lookBody, state.look, "frameColor", "Frame Color", callbacks.onLiveChange);
  bindColor(lookBody, state.look, "headCircleColor", "Head Circle Color", callbacks.onLiveChange);
  bindCheckbox(lookBody, state.look, "showHeadCircles", "Head Circles", callbacks.onLiveChange);
  bindRange(lookBody, state.look, "headCircleSize", {
    label: "Head Circle Size",
    min: 0.4,
    max: 8,
    step: 0.01,
    precision: 2,
  }, callbacks.onLiveChange);
  bindRange(lookBody, state.look, "headCircleOpacity", {
    label: "Head Circle Opacity",
    min: 0,
    max: 1,
    step: 0.01,
    precision: 2,
  }, callbacks.onLiveChange);
  bindRange(lookBody, state.look, "headCircleThickness", {
    label: "Head Circle Thickness",
    min: 0.06,
    max: 0.48,
    step: 0.01,
    precision: 2,
  }, callbacks.onLiveChange);
  bindColor(lookBody, state.look, "sphereColor", "Sphere Color", callbacks.onLiveChange);
  bindRange(lookBody, state.look, "sphereBrightness", {
    label: "Sphere Brightness",
    min: 0,
    max: 2,
    step: 0.01,
    precision: 2,
  }, callbacks.onLiveChange);
  bindRange(lookBody, state.look, "sphereContrast", {
    label: "Sphere Contrast",
    min: 0,
    max: 2,
    step: 0.01,
    precision: 2,
  }, callbacks.onLiveChange);
  bindRange(lookBody, state.look, "sphereRoughness", {
    label: "Sphere Roughness",
    min: 0,
    max: 1,
    step: 0.01,
    precision: 2,
  }, callbacks.onLiveChange);
  bindRange(lookBody, state.look, "sphereMetalness", {
    label: "Sphere Metalness",
    min: 0,
    max: 1,
    step: 0.01,
    precision: 2,
  }, callbacks.onLiveChange);
  bindRange(lookBody, state.look, "haloOpacity", {
    label: "Halo Opacity",
    min: 0,
    max: 1,
    step: 0.01,
    precision: 2,
  }, callbacks.onLiveChange);
  bindRange(lookBody, state.look, "haloSoftness", {
    label: "Halo Softness",
    min: 0,
    max: 1.5,
    step: 0.01,
    precision: 2,
  }, callbacks.onLiveChange);
  bindCheckbox(lookBody, state.look, "showTrails", "Trail Lines", callbacks.onLiveChange);
  bindCheckbox(lookBody, state.look, "feedbackTrail", "Feedback Trail", callbacks.onLiveChange);
  bindRange(lookBody, state.look, "feedbackDamp", {
    label: "Feedback Damp",
    min: 0.72,
    max: 0.98,
    step: 0.005,
    precision: 3,
  }, callbacks.onLiveChange);
  bindRange(lookBody, state.look, "lineOpacity", {
    label: "Line Opacity",
    min: 0.02,
    max: 0.4,
    step: 0.005,
    precision: 3,
  }, callbacks.onLiveChange);
  bindRange(lookBody, state.look, "lineBrightness", {
    label: "Line Brightness",
    min: 0.4,
    max: 2.6,
    step: 0.01,
    precision: 2,
  }, callbacks.onLiveChange);
  bindRange(lookBody, state.look, "pointSize", {
    label: "Point Size",
    min: 0.2,
    max: 7,
    step: 0.01,
    precision: 2,
  }, callbacks.onLiveChange);
  bindRange(lookBody, state.look, "frameOpacity", {
    label: "Frame Opacity",
    min: 0.05,
    max: 1,
    step: 0.01,
    precision: 2,
  }, callbacks.onLiveChange);
  bindRange(lookBody, state.look, "contrast", {
    label: "Contrast",
    min: 0.5,
    max: 2.5,
    step: 0.01,
    precision: 2,
  }, callbacks.onLiveChange);
  bindRange(lookBody, state.look, "grainDensity", {
    label: "Grain Density",
    min: 0,
    max: 1,
    step: 0.01,
    precision: 2,
  }, callbacks.onLiveChange);

  const renderFolder = createFolder("RENDER", true);
  const renderBody = requireElement<HTMLDivElement>(renderFolder, ".folder-body");
  bindRange(renderBody, state.render, "pixelRatioCap", {
    label: "Pixel Ratio Cap",
    min: 0.75,
    max: 2.5,
    step: 0.05,
    precision: 2,
  }, callbacks.onLiveChange);
  bindSelect(
    renderBody,
    state.render,
    "fpsLimit",
    "FPS Limit",
    [
      { label: "30 FPS", value: "30" as FpsLimitMode },
      { label: "60 FPS", value: "60" as FpsLimitMode },
      { label: "Unlimited", value: "unlimited" as FpsLimitMode },
    ],
    callbacks.onLiveChange,
  );

  const uiFolder = createFolder("UI CONFIG", true);
  const uiBody = requireElement<HTMLDivElement>(uiFolder, ".folder-body");
  bindSelect(
    uiBody,
    state.ui,
    "depth",
    "UI Bevel",
    [
      { label: "Soft", value: "soft" },
      { label: "Medium", value: "medium" },
      { label: "Deep", value: "deep" },
    ],
    onUiChange,
  );
  bindCheckbox(uiBody, state.ui, "soloNoisePlane", "Solo Noise Plane", onUiChange);
  bindRange(uiBody, state.ui, "bevelStrength", {
    label: "Bevel Shape",
    min: 0.6,
    max: 1.8,
    step: 0.01,
    precision: 2,
  }, onUiChange);
  bindTextField(uiBody, state.ui, "mainTitle", "Main Title", onUiChange, {
    placeholder: "FLOW MATTER",
  });
  bindTextField(uiBody, state.ui, "description", "Description", onUiChange, {
    multiline: true,
    rows: 3,
    placeholder: "Reference-driven 2D flow field.\nProcedural reconstruction.",
  });
  bindColor(uiBody, state.ui, "textColor", "UI Text Color", onUiChange);
  bindColor(uiBody, state.ui, "folderNameColor", "Folder Name Color", onUiChange);
  bindColor(uiBody, state.ui, "mainColor", "Main UI Color", onUiChange);
  bindColor(uiBody, state.ui, "headColor", "Head Color", onUiChange);
  bindRange(uiBody, state.ui, "headLightness", {
    label: "Head/Folder Lightness",
    min: 0.7,
    max: 1.35,
    step: 0.01,
    precision: 2,
  }, onUiChange);
  bindRange(uiBody, state.ui, "saturation", {
    label: "UI Saturation",
    min: 0,
    max: 2,
    step: 0.01,
    precision: 2,
  }, onUiChange);
  bindColor(uiBody, state.ui, "accentColor", "Accent Color", onUiChange);
  bindColor(uiBody, state.ui, "sliderFillColor", "Slider Fill", onUiChange);
  bindColor(uiBody, state.ui, "scrollbarColor", "Scrollbar Color", onUiChange);
  bindRange(uiBody, state.ui, "scale", {
    label: "UI Size",
    min: 0.75,
    max: 1.6,
    step: 0.01,
    precision: 2,
  }, onUiChange);
  bindRange(uiBody, state.ui, "widthScale", {
    label: "UI Width",
    min: 0.6,
    max: 1.8,
    step: 0.01,
    precision: 2,
  }, onUiChange);
  bindRange(uiBody, state.ui, "menuSectionGap", {
    label: "Folder Gap",
    min: 0.2,
    max: 1.8,
    step: 0.01,
    precision: 2,
  }, onUiChange);
  bindRange(uiBody, state.ui, "menuPaddingTop", {
    label: "Menu Padding Top",
    min: 0,
    max: 2,
    step: 0.01,
    precision: 2,
  }, onUiChange);
  bindRange(uiBody, state.ui, "menuPaddingBottom", {
    label: "Menu Padding Bottom",
    min: 0,
    max: 2,
    step: 0.01,
    precision: 2,
  }, onUiChange);
  tabPanels.flow.appendChild(flowFolder);
  tabPanels.topology.appendChild(topologyFolder);
  tabPanels.topology.appendChild(layoutFolder);
  tabPanels.look.appendChild(lookFolder);
  tabPanels.render.appendChild(renderFolder);
  tabPanels.ui.appendChild(uiFolder);

  tabsNavSlot.appendChild(tabsNav);
  foldersRoot.appendChild(tabsPanels);
  setActiveTab("flow");

  const applyUiVisibility = (): void => {
    root.dataset.uiHidden = uiHidden ? "true" : "false";
    panelDock.dataset.uiHidden = uiHidden ? "true" : "false";
    uiVisibilityButton.setAttribute("aria-label", uiHidden ? "Show UI" : "Hide UI");
    scheduleScrollbarTrackAnchorsUpdate(false);
    scheduleHintPositionUpdate();
  };

  const onUiVisibilityToggleClick = (): void => {
    uiHidden = !uiHidden;
    applyUiVisibility();
  };

  const onPanelScroll = (): void => {
    updateCustomScrollbarThumb();
  };

  const onWindowResize = (): void => {
    scheduleScrollbarTrackAnchorsUpdate();
    scheduleHintPositionUpdate();
  };

  uiVisibilityButton.addEventListener("click", onUiVisibilityToggleClick);
  tabsPanels.addEventListener("scroll", onPanelScroll, { passive: true });
  window.addEventListener("resize", onWindowResize);
  cleanup.push(() => uiVisibilityButton.removeEventListener("click", onUiVisibilityToggleClick));
  cleanup.push(() => tabsPanels.removeEventListener("scroll", onPanelScroll));
  cleanup.push(() => window.removeEventListener("resize", onWindowResize));
  cleanup.push(() => {
    if (hintPositionRafId !== 0) {
      window.cancelAnimationFrame(hintPositionRafId);
      hintPositionRafId = 0;
    }
    if (scrollbarAnchorRafId !== 0) {
      window.cancelAnimationFrame(scrollbarAnchorRafId);
      scrollbarAnchorRafId = 0;
    }
  });

  applyUiVisibility();
  applyUiThemeSettings();
  scheduleScrollbarTrackAnchorsUpdate();
  scheduleHintPositionUpdate();

  return {
    setStatus(text: string, kind: "info" | "error" = "info"): void {
      statusLine.textContent = text;
      statusLine.dataset.kind = kind;
    },
    setFps(fps: number): void {
      const safeFps = Number.isFinite(fps) ? Math.max(0, fps) : 0;
      fpsReadout.textContent = `FPS: ${safeFps.toFixed(0)}`;
    },
    dispose(): void {
      for (const remove of cleanup) {
        remove();
      }
      root.innerHTML = "";
    },
  };
}
