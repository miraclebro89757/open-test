"use client";

import { useEffect, useId, useImperativeHandle, useRef, useState, type Ref } from "react";
import { useI18n } from "@/hooks/useI18n";
import {
  describeProjectChoices,
  projectChoices,
  type NewSessionTarget,
  type ProjectChoice,
} from "@/lib/new-session-context";
import { projectNameOf } from "@/lib/session-tree";
import { ActivitySummary } from "./SessionTree";
import { SidebarMenu, type SidebarMenuAnchor, type SidebarMenuItem } from "./SidebarMenu";
import { ChevronIcon, ExclamationIcon, FolderPlusIcon } from "./SidebarIcons";

export interface WorkspaceSwitcherHandle {
  /** Opens the project menu under the switcher. */
  open(): void;
}

interface Props {
  project: ProjectChoice | null;
  projects: readonly ProjectChoice[];
  projectActivity?: ReadonlyMap<string, { running: number; unread: number }>;
  homeDir?: string;
  mobile: boolean;
  handleRef?: Ref<WorkspaceSwitcherHandle>;
  onPick: (target: NewSessionTarget) => void;
  onOpenFolder: (opener: HTMLElement | null) => void;
}

function displayPath(path: string, homeDir?: string): string {
  return homeDir && path.startsWith(homeDir) ? `~${path.slice(homeDir.length)}` : path;
}

function anchorOf(element: HTMLElement): SidebarMenuAnchor {
  const rect = element.getBoundingClientRect();
  return {
    kind: "rect",
    rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
    align: "start",
  };
}

/** The window's current project. Sessions and files below it belong to this choice. */
export function WorkspaceSwitcher({
  project,
  projects,
  projectActivity,
  homeDir,
  mobile,
  handleRef,
  onPick,
  onOpenFolder,
}: Props) {
  const { t } = useI18n();
  const hintId = useId();
  const aboutRef = useRef<HTMLButtonElement>(null);
  const noteRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ anchor: SidebarMenuAnchor; opener: HTMLElement } | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const classic = !mobile;
  const name = project ? projectNameOf(project.root) : "";
  const otherActivity = projectActivity !== undefined && [...projectActivity].some(
    ([key, activity]) => key !== project?.key && (activity.running > 0 || activity.unread > 0),
  );

  useEffect(() => {
    if (!aboutOpen) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (aboutRef.current?.contains(target) || noteRef.current?.contains(target)) return;
      setAboutOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAboutOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [aboutOpen]);

  const openAt = (opener: HTMLElement) => {
    setAboutOpen(false);
    setMenu({ anchor: anchorOf(opener), opener });
  };
  const openAtRef = useRef(openAt);
  openAtRef.current = openAt;

  useImperativeHandle(handleRef, () => ({
    open() {
      const button = document.getElementById("workspace-switcher");
      if (button instanceof HTMLElement) openAtRef.current(button);
    },
  }), []);

  const items = (): SidebarMenuItem[] => {
    const choices = describeProjectChoices(projectChoices({
      project,
      worktrees: null,
      currentWorktreePath: null,
      projects,
    })).map(({ choice, name: label, note }): SidebarMenuItem => {
      const activity = projectActivity?.get(choice.key);
      return {
        type: "item",
        id: `project:${choice.key}`,
        label: classic ? displayPath(choice.root, homeDir) : label,
        note: classic ? undefined : note ?? undefined,
        mono: classic,
        path: classic,
        title: choice.root,
        checked: choice.key === project?.key,
        badge: activity && (activity.running > 0 || activity.unread > 0)
          ? <ActivitySummary running={activity.running} unread={activity.unread} t={(key) => t(key)} />
          : undefined,
        onSelect: () => {
          if (choice.key === project?.key) return;
          onPick({ cwd: choice.root, projectKey: choice.key, projectRoot: choice.root });
        },
      };
    });
    const separator: SidebarMenuItem[] = choices.length > 0 ? [{ type: "separator", id: "separator" }] : [];
    return [
      ...choices,
      ...separator,
      {
        type: "item",
        id: "open-folder",
        label: t("sidebar.openOtherProject"),
        icon: <FolderPlusIcon size={13} />,
        onSelect: () => onOpenFolder(menu?.opener ?? null),
      },
    ];
  };

  return (
    <div className="workspace-switcher">
      <button
        id="workspace-switcher"
        type="button"
        className="workspace-switcher-button"
        title={project ? project.root : t("sidebar.selectProject")}
        aria-haspopup={project || projects.length > 0 ? "menu" : "dialog"}
        aria-expanded={menu !== null}
        aria-label={project ? `${t("workspace.project")}: ${name}` : t("sidebar.selectProject")}
        onClick={(event) => {
          if (!project && projects.length === 0) {
            onOpenFolder(event.currentTarget);
            return;
          }
          openAt(event.currentTarget);
        }}
      >
        <span className="workspace-switcher-name">{project ? name : t("sidebar.selectProject")}</span>
        {otherActivity ? (
          <span className="project-picker-activity" role="img" title={t("sidebar.newActivity")} aria-label={t("sidebar.newActivity")} />
        ) : null}
        <ChevronIcon size={11} className="sidebar-icon-down" />
      </button>
      <button
        ref={aboutRef}
        type="button"
        className="workspace-switcher-about"
        aria-expanded={aboutOpen}
        aria-controls={hintId}
        aria-label={t("workspace.switcherAbout")}
        onClick={() => setAboutOpen((open) => !open)}
      >
        <ExclamationIcon size={14} />
      </button>
      {aboutOpen ? (
        <div ref={noteRef} id={hintId} role="note" className="workspace-switcher-note">
          {t("workspace.switcherHint")}
        </div>
      ) : null}
      <SidebarMenu
        open={menu !== null}
        anchor={menu?.anchor ?? null}
        sheet={mobile}
        ariaLabel={t("workspace.project")}
        title={t("workspace.project")}
        items={menu ? items() : []}
        filter={{ placeholder: t("sidebar.filterProjects"), emptyLabel: t("sidebar.noMatchingProjects"), minChoices: classic ? 9 : undefined }}
        cancelLabel={t("sidebar.dismiss")}
        onClose={() => setMenu(null)}
        returnFocusTo={menu?.opener ?? null}
        width={Math.max(260, menu ? Math.round(menu.opener.getBoundingClientRect().width) : 260)}
        classic={classic}
      />
    </div>
  );
}
