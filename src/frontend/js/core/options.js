/** Shared option lists and labels used by the intake form and filters. */

export const SKILL_LEVELS = [
  { value: 1, label: "Aware", hint: "I know what it is, rarely apply it" },
  { value: 2, label: "Working", hint: "I can do it with guidance" },
  { value: 3, label: "Confident", hint: "I apply it independently" },
  { value: 4, label: "Advanced", hint: "I handle complex cases and coach others" },
  { value: 5, label: "Expert", hint: "I set the standard in this area" },
];

export const SECTORS = [
  "Public sector",
  "Healthcare",
  "Education",
  "Manufacturing & logistics",
  "Energy & utilities",
  "Finance",
  "Technology",
  "Retail & services",
  "Media",
  "Other",
];

export const REGIONS = [
  "Global",
  "Southeast Asia",
  "Singapore",
  "Malaysia",
  "APAC",
  "EU",
  "United Kingdom",
  "North America",
];

export const EDUCATION = ["Secondary", "Diploma / vocational", "Bachelor's degree", "Master's degree", "Doctorate", "Other"];

export const INTERESTS = [
  { id: "ai", label: "AI & automation" },
  { id: "public", label: "Public services" },
  { id: "climate", label: "Climate & sustainability" },
  { id: "health", label: "Health & care" },
  { id: "design", label: "Design & research" },
  { id: "data", label: "Data & analysis" },
  { id: "security", label: "Security & risk" },
  { id: "people", label: "People & skills" },
  { id: "governance", label: "Governance & policy" },
];

export const WORK_PREFERENCES = [
  { id: "remote", label: "Remote-friendly" },
  { id: "public", label: "Public sector" },
  { id: "hybrid", label: "Hybrid" },
  { id: "field", label: "On-site / field" },
];

export const HOURS_OPTIONS = [3, 5, 8, 12, 16, 20];

export const BUDGET_OPTIONS = [
  { value: 0, label: "Free only" },
  { value: 300, label: "Up to $300" },
  { value: 800, label: "Up to $800" },
  { value: 2000, label: "Up to $2,000" },
  { value: 5000, label: "$5,000+" },
];

export const SIGNAL_TYPES = [
  { id: "labour-market", label: "Labour market" },
  { id: "technology", label: "Technology" },
  { id: "policy", label: "Policy" },
  { id: "skills-framework", label: "Skills framework" },
  { id: "research", label: "Research" },
];

export const MOMENTUM_OPTIONS = [
  { id: "rising", label: "Rising" },
  { id: "stable", label: "Stable" },
  { id: "declining", label: "Declining" },
];

export const SORT_OPTIONS = [
  { id: "recent", label: "Most recent" },
  { id: "impact", label: "Highest impact" },
];

export const FORMAT_LABELS = {
  "self-paced": "Self-paced",
  cohort: "Cohort",
  workshop: "Workshop",
  project: "Project",
};

export const LEVEL_LABELS = {
  foundation: "Foundation",
  intermediate: "Intermediate",
  advanced: "Advanced",
};
