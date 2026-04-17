import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  groupInstructors,
  groups,
  problemGroupAccess,
  problems,
  problemSetGroupAccess,
  problemSets,
} from "@/lib/db/schema";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { isAtLeastRoleAsync } from "@/lib/auth/role-helpers";

type ProblemSetListOptions = {
  limit?: number;
  offset?: number;
};

export type VisibleProblemSetListItem = {
  id: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  problems: Array<{ id: string }>;
  groupAccess: Array<{ id: string; groupId: string }>;
  creator: { id: string; name: string | null; username: string | null } | null;
};

export type VisibleProblemSetDetail = {
  id: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  problems: Array<{
    problemId: string;
    sortOrder: number | null;
    problem: { id: string; title: string };
  }>;
  groupAccess: Array<{
    groupId: string;
    group: { id: string; name: string };
  }>;
  creator: { id: string; name: string | null; username: string | null } | null;
};

const PROBLEM_SET_CAPABILITIES = [
  "problem_sets.create",
  "problem_sets.edit",
  "problem_sets.delete",
  "problem_sets.assign_groups",
] as const;

export type ProblemSetCapabilityFlags = {
  canAccess: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canAssignGroups: boolean;
};

async function canViewAllProblemSets(role: string) {
  if (await isAtLeastRoleAsync(role, "admin")) return true;
  const caps = await resolveCapabilities(role);
  return caps.has("groups.view_all") && PROBLEM_SET_CAPABILITIES.some((capability) => caps.has(capability));
}

export async function getProblemSetCapabilityFlags(
  role: string
): Promise<ProblemSetCapabilityFlags> {
  const caps = await resolveCapabilities(role);
  const canCreate = caps.has("problem_sets.create");
  const canEdit = caps.has("problem_sets.edit");
  const canDelete = caps.has("problem_sets.delete");
  const canAssignGroups = caps.has("problem_sets.assign_groups");

  return {
    canAccess: canCreate || canEdit || canDelete || canAssignGroups,
    canCreate,
    canEdit,
    canDelete,
    canAssignGroups,
  };
}

export async function getManageableProblemSetGroupIds(userId: string, role: string) {
  if (await canViewAllProblemSets(role)) {
    const allGroups = await db.select({ id: groups.id }).from(groups);
    return allGroups.map((group) => group.id);
  }

  const [ownedGroups, assignedGroups] = await Promise.all([
    db
      .select({ id: groups.id })
      .from(groups)
      .where(eq(groups.instructorId, userId)),
    db
      .select({ id: groupInstructors.groupId })
      .from(groupInstructors)
      .where(
        and(
          eq(groupInstructors.userId, userId),
          eq(groupInstructors.role, "co_instructor")
        )
      ),
  ]);

  return [...new Set([...ownedGroups, ...assignedGroups].map((group) => group.id))];
}

async function getVisibleProblemSetIds(userId: string, role: string) {
  if (await canViewAllProblemSets(role)) return null;

  const manageableGroupIds = await getManageableProblemSetGroupIds(userId, role);
  const visibleIds = new Set<string>();

  const createdSets = await db
    .select({ id: problemSets.id })
    .from(problemSets)
    .where(eq(problemSets.createdBy, userId));

  for (const row of createdSets) {
    visibleIds.add(row.id);
  }

  if (manageableGroupIds.length > 0) {
    const assignedSets = await db
      .select({ id: problemSetGroupAccess.problemSetId })
      .from(problemSetGroupAccess)
      .where(inArray(problemSetGroupAccess.groupId, manageableGroupIds));

    for (const row of assignedSets) {
      visibleIds.add(row.id);
    }
  }

  return [...visibleIds];
}

function problemSetQueryOptions(options: ProblemSetListOptions = {}) {
  return {
    orderBy: [desc(problemSets.createdAt)],
    limit: options.limit,
    offset: options.offset,
    with: {
      problems: {
        columns: { id: true },
      },
      groupAccess: {
        columns: { id: true, groupId: true },
      },
      creator: {
        columns: { id: true, name: true, username: true },
      },
    },
  };
}

export async function countVisibleProblemSetsForUser(userId: string, role: string) {
  const visibleIds = await getVisibleProblemSetIds(userId, role);
  if (visibleIds === null) {
    const allSets = await db.select({ id: problemSets.id }).from(problemSets);
    return allSets.length;
  }
  return visibleIds.length;
}

export async function listVisibleProblemSetsForUser(
  userId: string,
  role: string,
  options: ProblemSetListOptions = {}
): Promise<VisibleProblemSetListItem[]> {
  const visibleIds = await getVisibleProblemSetIds(userId, role);
  if (visibleIds === null) {
    return db.query.problemSets.findMany(problemSetQueryOptions(options)) as unknown as Promise<
      VisibleProblemSetListItem[]
    >;
  }
  if (visibleIds.length === 0) return [];

  return db.query.problemSets.findMany({
    ...problemSetQueryOptions(options),
    where: inArray(problemSets.id, visibleIds),
  }) as unknown as Promise<VisibleProblemSetListItem[]>;
}

export async function getVisibleProblemSetByIdForUser(
  id: string,
  userId: string,
  role: string
): Promise<VisibleProblemSetDetail | null> {
  const visibleIds = await getVisibleProblemSetIds(userId, role);
  if (visibleIds !== null && !visibleIds.includes(id)) {
    return null;
  }

  return db.query.problemSets.findFirst({
    where: eq(problemSets.id, id),
    with: {
      problems: {
        with: {
          problem: {
            columns: { id: true, title: true },
          },
        },
      },
      groupAccess: {
        with: {
          group: {
            columns: { id: true, name: true },
          },
        },
      },
      creator: {
        columns: { id: true, name: true, username: true },
      },
    },
  }) as Promise<VisibleProblemSetDetail | null>;
}

export async function getAvailableProblemsForProblemSetUser(
  userId: string,
  role: string
) {
  const caps = await resolveCapabilities(role);
  if ((await canViewAllProblemSets(role)) || caps.has("problems.view_all")) {
    return db
      .select({ id: problems.id, title: problems.title })
      .from(problems)
      .orderBy(asc(problems.title));
  }

  const manageableGroupIds = await getManageableProblemSetGroupIds(userId, role);
  if (manageableGroupIds.length === 0) {
    return db
      .selectDistinct({ id: problems.id, title: problems.title })
      .from(problems)
      .where(or(eq(problems.authorId, userId), eq(problems.visibility, "public")))
      .orderBy(asc(problems.title));
  }

  return db
    .selectDistinct({ id: problems.id, title: problems.title })
    .from(problems)
    .leftJoin(problemGroupAccess, eq(problemGroupAccess.problemId, problems.id))
    .where(
      or(
        eq(problems.authorId, userId),
        eq(problems.visibility, "public"),
        inArray(problemGroupAccess.groupId, manageableGroupIds)
      )
    )
    .orderBy(asc(problems.title));
}

export async function getAvailableGroupsForProblemSetUser(
  userId: string,
  role: string
) {
  const manageableGroupIds = await getManageableProblemSetGroupIds(userId, role);
  if (manageableGroupIds.length === 0) {
    return [] as Array<{ id: string; name: string }>;
  }

  return db.query.groups.findMany({
    columns: { id: true, name: true },
    where: inArray(groups.id, manageableGroupIds),
    orderBy: [asc(groups.name)],
  });
}

export async function canManageProblemSetForUser(
  createdBy: string | null,
  groupIds: string[],
  userId: string,
  role: string
) {
  if (await canViewAllProblemSets(role)) return true;
  if (createdBy && createdBy === userId) return true;
  if (groupIds.length === 0) return false;

  const manageableGroupIds = new Set(await getManageableProblemSetGroupIds(userId, role));
  return groupIds.every((groupId) => manageableGroupIds.has(groupId));
}

export async function findInaccessibleProblemIdsForProblemSetUser(
  problemIds: string[],
  userId: string,
  role: string
) {
  if (problemIds.length === 0) return [];

  const availableProblemIds = new Set(
    (await getAvailableProblemsForProblemSetUser(userId, role)).map((problem) => problem.id)
  );
  return problemIds.filter((problemId) => !availableProblemIds.has(problemId));
}

export async function findInaccessibleGroupIdsForProblemSetUser(
  groupIds: string[],
  userId: string,
  role: string
) {
  if (groupIds.length === 0) return [];

  const availableGroupIds = new Set(
    (await getAvailableGroupsForProblemSetUser(userId, role)).map((group) => group.id)
  );
  return groupIds.filter((groupId) => !availableGroupIds.has(groupId));
}
