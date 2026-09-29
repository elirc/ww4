import type {
  AutomationActionType,
  AutomationEventType,
  CustomFieldType,
  IssuePriority,
  IssueType,
  OrganizationRole,
  ProjectRole,
  WorkflowStatusCategory,
} from "@prisma/client";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
};

export type SessionOrganization = {
  id: string;
  name: string;
  slug: string;
  role: OrganizationRole;
};

export type SessionContext = {
  sessionId: string;
  user: SessionUser;
  activeOrganization: SessionOrganization;
  organizations: SessionOrganization[];
};

export type ProjectAccessContext = {
  organizationId: string;
  organizationRole: OrganizationRole;
  projectId: string;
  projectKey: string;
  projectRole: ProjectRole | null;
};

export type BoardColumnView = {
  id: string;
  name: string;
  position: number;
  wipLimit: number | null;
  status: {
    id: string;
    key: string;
    name: string;
    category: WorkflowStatusCategory;
  };
};

export type CustomFieldView = {
  id: string;
  key: string;
  name: string;
  type: CustomFieldType;
  required: boolean;
  position: number;
  config: Record<string, unknown> | null;
};

export type IssueView = {
  id: string;
  key: string;
  sequenceNumber: number;
  title: string;
  description: string | null;
  type: IssueType;
  priority: IssuePriority;
  dueDate: string | null;
  status: {
    id: string;
    key: string;
    name: string;
    category: WorkflowStatusCategory;
  };
  reporter: {
    id: string;
    name: string;
  };
  assignee: {
    id: string;
    name: string;
  } | null;
  customFieldValues: Array<{
    customFieldId: string;
    value: unknown;
  }>;
  comments: Array<{
    id: string;
    body: string;
    isSystem: boolean;
    createdAt: string;
    author: {
      id: string;
      name: string;
    };
  }>;
  activities: Array<{
    id: string;
    type: string;
    message: string;
    createdAt: string;
    actor: {
      id: string;
      name: string;
    } | null;
  }>;
};

export type ProjectSummaryView = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  memberRole: ProjectRole | null;
  issueCount: number;
  openIssueCount: number;
};

export type SavedFilterView = {
  id: string;
  name: string;
  isShared: boolean;
  query: Record<string, unknown>;
  owner: {
    id: string;
    name: string;
  };
};

export type AutomationRuleView = {
  id: string;
  name: string;
  isEnabled: boolean;
  eventType: AutomationEventType;
  actionType: AutomationActionType;
  conditions: Record<string, unknown> | null;
  actionPayload: Record<string, unknown>;
};

export type WorkspaceBootstrap = {
  session: SessionContext;
  projects: ProjectSummaryView[];
  selectedProject: {
    id: string;
    key: string;
    name: string;
    description: string | null;
    memberRole: ProjectRole | null;
    statuses: BoardColumnView[];
    customFields: CustomFieldView[];
    issues: IssueView[];
    savedFilters: SavedFilterView[];
    automationRules: AutomationRuleView[];
    pendingAutomationJobs: number;
    members: Array<{
      id: string;
      name: string;
      email: string;
    }>;
  } | null;
};
