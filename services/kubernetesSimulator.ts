
import { Pod, ResourceStatus, ClusterState, K8sEvent, SchedulingConstraint } from '../types';

const INITIAL_NAMESPACES = ['default', 'kube-system', 'production', 'monitoring'];

const generateMockEvents = (podName: string, nodeName: string): K8sEvent[] => {
  const now = new Date();
  return [
    {
      id: Math.random().toString(36).substr(2, 9),
      type: 'Normal',
      reason: 'Scheduled',
      message: `Successfully assigned ${podName} to ${nodeName}`,
      timestamp: new Date(now.getTime() - 1000 * 60 * 60).toISOString()
    },
    {
      id: Math.random().toString(36).substr(2, 9),
      type: 'Normal',
      reason: 'Pulling',
      message: `Pulling image "nginx:latest"`,
      timestamp: new Date(now.getTime() - 1000 * 60 * 59).toISOString()
    },
    {
      id: Math.random().toString(36).substr(2, 9),
      type: 'Normal',
      reason: 'Pulled',
      message: `Successfully pulled image "nginx:latest" in 2.1s`,
      timestamp: new Date(now.getTime() - 1000 * 60 * 58).toISOString()
    },
    {
      id: Math.random().toString(36).substr(2, 9),
      type: 'Normal',
      reason: 'Created',
      message: `Created container main`,
      timestamp: new Date(now.getTime() - 1000 * 60 * 57).toISOString()
    },
    {
      id: Math.random().toString(36).substr(2, 9),
      type: 'Normal',
      reason: 'Started',
      message: `Started container main`,
      timestamp: new Date(now.getTime() - 1000 * 60 * 56).toISOString()
    }
  ];
};

const generateMockPods = (): Pod[] => {
  const pods: Pod[] = [];
  const nodes = ['node-1', 'node-2', 'node-3'];
  
  // Default pods
  const names = ['api-gateway', 'auth-service', 'user-db', 'redis-cache', 'worker-node-a'];
  names.forEach((name, i) => {
    const nodeName = nodes[i % nodes.length];
    const fullPodName = `${name}-${Math.random().toString(36).substr(0, 5)}`;
    
    // Assign some interesting constraints
    const constraints: SchedulingConstraint[] = [];
    if (name === 'api-gateway') {
      constraints.push({ type: 'NodeAffinity', rule: 'Required', labelSelector: 'disk=ssd' });
    }
    if (name === 'user-db') {
      constraints.push({ type: 'PodAntiAffinity', rule: 'Required', labelSelector: 'app=user-db' });
    }
    if (name === 'redis-cache') {
      constraints.push({ type: 'PodAffinity', rule: 'Preferred', labelSelector: 'app=user-db' });
    }

    pods.push({
      id: `pod-${Math.random().toString(36).substr(2, 9)}`,
      name: fullPodName,
      namespace: 'default',
      status: ResourceStatus.RUNNING,
      ip: `10.244.0.${i + 10}`,
      node: nodeName,
      labels: { app: name, tier: i < 2 ? 'frontend' : 'backend' },
      creationTimestamp: new Date().toISOString(),
      usage: {
        cpu: Math.floor(Math.random() * 60) + 5,
        memory: Math.floor(Math.random() * 70) + 10
      },
      events: generateMockEvents(fullPodName, nodeName),
      connections: [],
      schedulingConstraints: constraints
    });
  });

  // System pods
  const systemNames = ['coredns', 'kube-proxy', 'calico-node', 'metrics-server'];
  systemNames.forEach((name, i) => {
    const nodeName = nodes[0];
    const fullPodName = `${name}-${Math.random().toString(36).substr(0, 5)}`;
    pods.push({
      id: `sys-${i}`,
      name: fullPodName,
      namespace: 'kube-system',
      status: ResourceStatus.RUNNING,
      ip: `10.96.0.${i + 1}`,
      node: nodeName,
      labels: { 'k8s-app': name },
      creationTimestamp: new Date().toISOString(),
      usage: {
        cpu: Math.floor(Math.random() * 15) + 2,
        memory: Math.floor(Math.random() * 20) + 5
      },
      events: generateMockEvents(fullPodName, nodeName),
      connections: []
    });
  });

  // Setup random connections
  pods.forEach(pod => {
    if (Math.random() > 0.5) {
      const targetCount = Math.floor(Math.random() * 2) + 1;
      for(let j=0; j<targetCount; j++) {
        const target = pods[Math.floor(Math.random() * pods.length)];
        if (target.id !== pod.id && !pod.connections?.includes(target.id)) {
          pod.connections?.push(target.id);
        }
      }
    }
  });

  return pods;
};

export class KubernetesSimulator {
  private state: ClusterState;

  constructor() {
    this.state = {
      pods: generateMockPods(),
      namespaces: INITIAL_NAMESPACES
    };
  }

  getState(): ClusterState {
    this.state.pods = this.state.pods.map(pod => {
      let status = pod.status;
      if (Math.random() < 0.01) {
        status = status === ResourceStatus.RUNNING ? ResourceStatus.ERROR : ResourceStatus.RUNNING;
      }
      let cpuDelta = (Math.random() * 10 - 5);
      if (Math.random() < 0.05) cpuDelta = 50; 

      return {
        ...pod,
        status,
        usage: {
          cpu: Math.max(0, Math.min(100, pod.usage.cpu + cpuDelta)),
          memory: Math.max(0, Math.min(100, pod.usage.memory + (Math.random() * 4 - 2)))
        }
      };
    });
    return this.state;
  }

  executeCommand(command: string): string {
    const cmd = command.trim();
    
    // Handle Interactive Shell
    if (cmd.includes('exec -it')) {
      const podName = cmd.match(/exec -it\s+([^\s]+)/)?.[1] || 'pod';
      return `Defaulting container name to main.
Successfully connected to pod/${podName}
/ # whoami
root
/ # ls -F /app
bin/  config.json  main.js  node_modules/  package.json  public/
/ # netstat -tuln
Active Internet connections (only servers)
Proto Recv-Q Send-Q Local Address           Foreign Address         State       
tcp        0      0 0.0.0.0:8080            0.0.0.0:*               LISTEN      
/ # ps aux
PID   USER     TIME  COMMAND
    1 root      0:05 node main.js
   42 root      0:00 /bin/sh
   43 root      0:00 ps aux
/ # exit
command terminated with exit code 0`;
    }

    if (cmd.includes('get pods')) {
      const nsMatch = cmd.match(/-n\s+(\S+)|--namespace=(\S+)/);
      const ns = nsMatch ? (nsMatch[1] || nsMatch[2]) : 'default';
      const all = cmd.includes('-A') || cmd.includes('--all-namespaces');
      const filtered = all ? this.state.pods : this.state.pods.filter(p => p.namespace === ns);
      if (filtered.length === 0) return `No resources found in ${ns} namespace.`;
      const header = "NAME".padEnd(30) + "READY".padEnd(10) + "STATUS".padEnd(15) + "RESTARTS".padEnd(10) + "AGE";
      const rows = filtered.map(p => `${p.name.padEnd(30)}1/1`.padEnd(10) + `${p.status.padEnd(15)}0`.padEnd(10) + `2d`);
      return [header, ...rows].join('\n');
    }

    if (cmd.includes('describe pod')) {
      const podName = cmd.split('describe pod ')[1]?.split(' ')[0];
      const pod = this.state.pods.find(p => p.name === podName);
      if (!pod) return `Error: pod "${podName}" not found`;
      return `Name: ${pod.name}\nNamespace: ${pod.namespace}\nStatus: ${pod.status}\nIP: ${pod.ip}`;
    }

    if (cmd.includes('logs')) {
      return `[${new Date().toISOString()}] INFO: Starting service...\n[${new Date().toISOString()}] INFO: Listening on port 8080\n[${new Date().toISOString()}] INFO: Health check passed`;
    }

    if (cmd.includes('tcpdump')) {
      return `tcpdump: listening on eth0, link-type EN10MB (Ethernet)
10:00:01.123 IP 10.244.0.10.45678 > 10.244.0.15.80: Flags [S]
10:00:01.124 IP 10.244.0.15.80 > 10.244.0.10.45678: Flags [S.]`;
    }

    return `Command executed: ${command}\nOutput: Success (Simulated)`;
  }
}
