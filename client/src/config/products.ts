export type ProductKey = "contentcraft" | "gamemastercraft" | "sagacraft";

export interface ProductConfig {
  key: ProductKey;
  name: string;
  shortName: string;
  appUrl: string;
  marketingUrl: string;
  audience: string;
  workspaceNoun: string;
  workspaceNounPlural: string;
  defaultWorkspaceType: string;
  primaryCta: string;
  emptyStateHeadline: string;
  emptyStateBody: string;
  onboardingHeadline: string;
  onboardingSubhead: string;
  seoTitle: string;
  seoDescription: string;
  themeClass: string;
  defaultTemplates: string[];
  navigationLabels: {
    dashboard: string;
    workspaces: string;
    characters: string;
    locations: string;
    lore: string;
    timeline: string;
    notes: string;
  };
  /** Which project types are available for creation in this product */
  projectTypes: string[];
}

export const PRODUCT_CONFIGS: Record<ProductKey, ProductConfig> = {
  contentcraft: {
    key: "contentcraft",
    name: "ContentCraft",
    shortName: "ContentCraft",
    appUrl: "https://contentcraft.sixsmithgames.com",
    marketingUrl: "https://sixsmithgames.com/apps/contentcraft",
    audience: "writers, worldbuilders, and creative builders",
    workspaceNoun: "Project",
    workspaceNounPlural: "Projects",
    defaultWorkspaceType: "creative_project",
    primaryCta: "Create Your Workspace",
    emptyStateHeadline: "Create your first creative workspace",
    emptyStateBody:
      "Organize your ideas, worlds, characters, notes, and long-form creative projects in one place.",
    onboardingHeadline: "Start your creative workspace",
    onboardingSubhead:
      "Build a project for writing, worldbuilding, lore, campaign material, or structured creative work.",
    seoTitle: "ContentCraft | AI Creative Writing and Worldbuilding Workspace",
    seoDescription:
      "ContentCraft helps writers, worldbuilders, and creators organize ideas, lore, characters, notes, and long-form creative projects.",
    themeClass: "theme-contentcraft",
    defaultTemplates: ["creative_project", "worldbuilding_project", "general_writing"],
    navigationLabels: {
      dashboard: "Dashboard",
      workspaces: "Projects",
      characters: "Characters",
      locations: "Locations",
      lore: "Lore",
      timeline: "Timeline",
      notes: "Notes",
    },
    projectTypes: ["fiction", "nonfiction", "dnd-adventure", "dnd-homebrew", "story-arc", "scene", "outline", "chapter", "memoir", "journal-entry", "other-writing"],
  },

  gamemastercraft: {
    key: "gamemastercraft",
    name: "GameMasterCraft",
    shortName: "GMCraft",
    appUrl: "https://gamemastercraft.sixsmithgames.com",
    marketingUrl: "https://sixsmithgames.com/apps/gamemastercraft",
    audience: "tabletop RPG game masters",
    workspaceNoun: "Campaign",
    workspaceNounPlural: "Campaigns",
    defaultWorkspaceType: "campaign",
    primaryCta: "Create Your Campaign Workspace",
    emptyStateHeadline: "Create your first campaign workspace",
    emptyStateBody:
      "Organize NPCs, factions, locations, lore, timelines, session notes, secrets, and campaign continuity.",
    onboardingHeadline: "Start your campaign workspace",
    onboardingSubhead:
      "Build a structured campaign hub for NPCs, factions, locations, lore, session notes, and player-driven consequences.",
    seoTitle: "GameMasterCraft | Campaign Planning and Worldbuilding Tool",
    seoDescription:
      "GameMasterCraft helps tabletop RPG game masters organize NPCs, factions, locations, lore, session notes, timelines, and campaign continuity.",
    themeClass: "theme-gamemastercraft",
    defaultTemplates: ["campaign", "homebrew_world", "published_adventure_tracker"],
    navigationLabels: {
      dashboard: "Campaign Dashboard",
      workspaces: "Campaigns",
      characters: "NPCs",
      locations: "Locations",
      lore: "Lore",
      timeline: "Timeline",
      notes: "Session Notes",
    },
    projectTypes: ["dnd-adventure", "dnd-homebrew", "story-arc", "scene"],
  },

  sagacraft: {
    key: "sagacraft",
    name: "SagaCraft",
    shortName: "SagaCraft",
    appUrl: "https://sagacraft.sixsmithgames.com",
    marketingUrl: "https://sixsmithgames.com/apps/sagacraft",
    audience: "novelists and fiction writers",
    workspaceNoun: "Story",
    workspaceNounPlural: "Stories",
    defaultWorkspaceType: "story",
    primaryCta: "Create Your Writing Workspace",
    emptyStateHeadline: "Create your first writing workspace",
    emptyStateBody:
      "Organize characters, chapters, plot threads, settings, timelines, lore, relationships, and story continuity.",
    onboardingHeadline: "Start your writing workspace",
    onboardingSubhead:
      "Build a structured story hub for characters, chapters, timelines, lore, plot threads, and revision notes.",
    seoTitle: "SagaCraft | Novel Writing and Story Continuity Tool",
    seoDescription:
      "SagaCraft helps novelists and fiction writers organize characters, plots, chapters, settings, timelines, lore, and story continuity.",
    themeClass: "theme-sagacraft",
    defaultTemplates: ["novel", "series_bible", "short_story_collection"],
    navigationLabels: {
      dashboard: "Writing Dashboard",
      workspaces: "Stories",
      characters: "Characters",
      locations: "Settings",
      lore: "Lore",
      timeline: "Timeline",
      notes: "Draft Notes",
    },
    projectTypes: ["fiction", "story-arc", "scene", "outline", "chapter", "memoir", "journal-entry", "other-writing"],
  },
};

export function getProductKey(): ProductKey {
  // Priority order: query param > environment variable > hostname > default
  
  // Check query parameter first
  if (typeof window !== "undefined") {
    const urlParams = new URLSearchParams(window.location.search);
    const queryProduct = urlParams.get("product");
    if (
      queryProduct === "contentcraft" ||
      queryProduct === "gamemastercraft" ||
      queryProduct === "sagacraft"
    ) {
      return queryProduct;
    }
  }

  // Check environment variable
  const configured =
    import.meta.env.VITE_PRODUCT_KEY ||
    "";

  if (
    configured === "contentcraft" ||
    configured === "gamemastercraft" ||
    configured === "sagacraft"
  ) {
    return configured;
  }

  // Fallback to hostname detection
  if (typeof window !== "undefined") {
    const host = window.location.hostname.toLowerCase();

    if (host.includes("gamemastercraft") || host.includes("gmcraft")) {
      return "gamemastercraft";
    }

    if (host.includes("sagacraft")) {
      return "sagacraft";
    }
  }

  // Default fallback
  return "contentcraft";
}

export function getProductConfig(): ProductConfig {
  return PRODUCT_CONFIGS[getProductKey()];
}
