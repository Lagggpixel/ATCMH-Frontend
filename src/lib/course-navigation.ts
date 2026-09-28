import type {CourseNavigationMode, ManagedCourseSection, ManagedCourseSectionGroup} from "@/src/dashboard/types/Course";

export function orderedCourseGroups(groups: ManagedCourseSectionGroup[] | undefined, sections: ManagedCourseSection[]) {
  if (groups?.length) return [...groups].sort((a, b) => a.sortOrder - b.sortOrder);
  return sections.map((section, index) => ({id: section.groupId || section.id, title: section.title, sortOrder: index + 1}));
}

export function canOpenSubsection(
  section: ManagedCourseSection,
  sections: ManagedCourseSection[],
  groups: ManagedCourseSectionGroup[],
  mode: CourseNavigationMode,
  completed: Set<string>,
) {
  if (completed.has(section.id) || mode === "free") return true;
  const index = sections.findIndex(item => item.id === section.id);
  if (index < 0) return false;
  if (mode === "sequential") return sections.slice(0, index).every(item => completed.has(item.id));
  const order = groups.find(group => group.id === section.groupId)?.sortOrder ?? 0;
  return sections.every(item => {
    const itemOrder = groups.find(group => group.id === item.groupId)?.sortOrder ?? 0;
    return itemOrder >= order || completed.has(item.id);
  });
}

export function resumeSubsection(
  sections: ManagedCourseSection[], groups: ManagedCourseSectionGroup[],
  mode: CourseNavigationMode, completed: Set<string>,
) {
  return sections.find(section => !completed.has(section.id)
    && canOpenSubsection(section, sections, groups, mode, completed)) ?? sections[0];
}

export function subsectionHref(courseId: string, sectionId: string, basePath?: string) {
  return `${basePath ?? `/exams/courses/${encodeURIComponent(courseId)}`}?subsection=${encodeURIComponent(sectionId)}`;
}
