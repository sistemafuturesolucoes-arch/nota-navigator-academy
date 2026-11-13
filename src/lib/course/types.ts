/** Rectangle over a screenshot, in percent of the image size (0-100). */
export type Hotspot = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  description: string;
  tip?: string;
};

export type Lesson = {
  id: string;
  moduleId: string;
  title: string;
  summary: string;
  /** Path the user follows inside the emissor, e.g. "Cadastros > Produtos". */
  path?: string;
  image?: string;
  video?: string;
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
