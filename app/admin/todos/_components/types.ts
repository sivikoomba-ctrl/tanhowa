export interface TodoUser {
  id: string;
  name: string;
  photo_url: string;
  occupation?: string;
}

export interface Team {
  id: string;
  name: string;
  icon: string;
}

export interface Todo {
  id: string;
  title: string;
  description: string;
  status: string;
  urgent: boolean;
  important: boolean;
  due_date: string | null;
  admin_remarks: string;
  submitted_by: string;
  assigned_to: string | null;
  assigned_team_id: string | null;
  parent_id: string | null;
  event_id: string;
  submitter: TodoUser | null;
  assignee: TodoUser | null;
  committed_by: string | null;
  committed_at: string | null;
  estimated_time: string;
  estimated_amount: number;
  timebox_hours: number | null;
  assigned_team: Team | null;
  committer: TodoUser | null;
  approved_by: string | null;
  approved_at: string | null;
  completed_at: string | null;
  created_at: string;
  subtask_count: number;
  subtask_completed: number;
}

export interface TodoNote {
  id: string;
  todo_id: string;
  content: string;
  type: string;
  created_at: string;
  author: TodoUser | null;
}

export interface TodoAttachment {
  id: string;
  todo_id: string;
  file_url: string;
  file_name: string;
  file_type: string;
  created_at: string;
  uploader: TodoUser | null;
}

export interface TodoVoucher {
  id: string;
  todo_id: string;
  title: string;
  amount: number;
  description: string;
  receipt_url: string | null;
  status: string;
  remarks: string;
  created_at: string;
  submitter: TodoUser | null;
  todo?: { id: string; title: string; event_id: string } | null;
}

export interface Member {
  id: string;
  name: string;
  photo_url: string;
  occupation: string;
}

export interface TimeEntry {
  id: string;
  todo_id: string;
  user_id: string;
  hours: number;
  description: string;
  logged_at: string;
  created_at: string;
  users: TodoUser | null;
}
