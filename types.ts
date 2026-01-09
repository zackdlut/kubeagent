
export enum ResourceStatus {
  RUNNING = 'Running',
  PENDING = 'Pending',
  ERROR = 'Error',
  TERMINATING = 'Terminating'
}

export interface PodUsage {
  cpu: number; // 0-100 percentage
  memory: number; // 0-100 percentage
}

export interface K8sEvent {
  id: string;
  type: 'Normal' | 'Warning';
  reason: string;
  message: string;
  timestamp: string;
}

export interface Alert {
  id: string;
  podId: string;
  podName: string;
  type: 'Status' | 'Utilization';
  severity: 'Warning' | 'Critical';
  message: string;
  timestamp: Date;
}

export interface SchedulingConstraint {
  type: 'NodeAffinity' | 'PodAffinity' | 'PodAntiAffinity';
  rule: 'Required' | 'Preferred';
  labelSelector: string;
}

export interface Pod {
  id: string;
  name: string;
  namespace: string;
  status: ResourceStatus;
  ip: string;
  node: string;
  labels: Record<string, string>;
  creationTimestamp: string;
  usage: PodUsage;
  events: K8sEvent[];
  connections?: string[]; // Array of Pod IDs this pod is "talking" to
  schedulingConstraints?: SchedulingConstraint[];
}

export interface K8sStep {
  description: string;
  command: string;
  explanation: string;
}

export interface AgentResponse {
  steps: K8sStep[];
  intent: 'QUERY' | 'ACTION' | 'DEBUG';
  summary: string;
}

export interface Message {
  role: 'user' | 'agent' | 'terminal';
  content: string;
  timestamp: Date;
  data?: any;
}

export interface ClusterState {
  pods: Pod[];
  namespaces: string[];
}
