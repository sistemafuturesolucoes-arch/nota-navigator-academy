/** Rectangle over a screenshot, in percent of the image size (0-100). */
export type Hotspot = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  description: string;
  tip?: string | undefined;
};

export type LessonScreenshot = {
  id: string;
  image: string;
  caption?: string | undefined;
  hotspots: Hotspot[];
};

export type Lesson = {
  id: string;
  moduleId: string;
  title: string;
  summary: string;
  /** Path the user follows inside the emissor, e.g. "Cadastros > Produtos". */
  path?: string | undefined;
  /** Legacy first screenshot field, kept for compatibility with existing lessons. */
  image?: string | undefined;
  /** All screenshots belonging to this lesson, each with its own clickable explanations. */
  screenshots?: LessonScreenshot[] | undefined;
  video?: string | undefined;
  content: string;
  hotspots: Hotspot[];
};

export type Module = {
  id: string;
  title: string;
  description: string;
  icon: string;
  lessonIds: string[];
};

export type Course = {
  version: number;
  modules: Module[];
  lessons: Record<string, Lesson>;
};
