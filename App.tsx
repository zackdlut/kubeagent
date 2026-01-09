
import React, { useState, useEffect, useRef } from 'react';
import { KubernetesSimulator } from './services/kubernetesSimulator';
import { GeminiService } from './services/geminiService';
import { Message, ClusterState, AgentResponse, Pod, Alert, ResourceStatus } from './types';
import ClusterView from './components/ClusterView';
import ChatBox from './components/ChatBox';
import TerminalView from './components/TerminalView';
import { Terminal, Layout, Activity, Cpu, Database, Network, Bell, AlertTriangle, AlertCircle, X, Globe, ChevronRight, Settings, Plus, Layers } from 'lucide-react';

const App: React.FC = () => {
  const [simulator] = useState(() => new KubernetesSimulator());
  const [gemini] = useState(() => new GeminiService());
  const [clusterState, setClusterState] = useState<ClusterState>(simulator.getState());
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [activeToast, setActiveToast] = useState<Alert | null>(null);
  const lastStateRef = useRef<ClusterState>(clusterState);

  // Context Management
  const [contexts, setContexts] = useState<string[]>(['minikube-dev', 'gke-prod-cluster', 'eks-staging-01']);
  const [activeContext, setActiveContext] = useState<string>('minikube-dev');
  const [showContextSelector, setShowContextSelector] = useState(false);

  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'agent',
      content: "Hello! I'm KubeAgent. I've enabled real-time monitoring for your cluster. I'll alert you if any pod enters an Error state or exceeds 90% utilization.",
      timestamp: new Date()
    }
  ]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<'topology' | 'terminal'>('topology');

  useEffect(() => {
    const interval = setInterval(() => {
      const newState = simulator.getState();
      const newAlerts: Alert[] = [];
      newState.pods.forEach(pod => {
        const lastPod = lastStateRef.current.pods.find(p => p.id === pod.id);
        if (!lastPod) return;
        if (pod.status === ResourceStatus.ERROR && lastPod.status !== ResourceStatus.ERROR) {
          newAlerts.push({
            id: Math.random().toString(36).substr(2, 9),
            podId: pod.id,
            podName: pod.name,
            type: 'Status',
            severity: 'Critical',
            message: `Pod ${pod.name} has entered Error state!`,
            timestamp: new Date()
          });
        }
        const THRESHOLD = 90;
        if ((pod.usage.cpu > THRESHOLD && lastPod.usage.cpu <= THRESHOLD) || 
            (pod.usage.memory > THRESHOLD && lastPod.usage.memory <= THRESHOLD)) {
          const metric = pod.usage.cpu > THRESHOLD ? 'CPU' : 'Memory';
          newAlerts.push({
            id: Math.random().toString(36).substr(2, 9),
            podId: pod.id,
            podName: pod.name,
            type: 'Utilization',
            severity: pod.usage.cpu > 95 ? 'Critical' : 'Warning',
            message: `High ${metric} usage on ${pod.name} (${Math.round(Math.max(pod.usage.cpu, pod.usage.memory))}%)`,
            timestamp: new Date()
          });
        }
      });
      if (newAlerts.length > 0) {
        setAlerts(prev => [...newAlerts, ...prev].slice(0, 50));
        setActiveToast(newAlerts[0]);
        setTimeout(() => setActiveToast(null), 5000);
      }
      lastStateRef.current = newState;
      setClusterState({ ...newState });
    }, 3000);
    return () => clearInterval(interval);
  }, [simulator]);

  const handleUserInput = async (text: string) => {
    const newUserMsg: Message = { role: 'user', content: text, timestamp: new Date() };
    setMessages(prev => [...prev, newUserMsg]);
    setIsProcessing(true);

    try {
      // Pass activeContext to the AI for grounding
      const response = await gemini.processRequest(`${text} (Executing in context: ${activeContext})`, clusterState);
      const agentMsg: Message = { 
        role: 'agent', 
        content: response.summary, 
        timestamp: new Date(),
        data: response
      };
      setMessages(prev => [...prev, agentMsg]);
      for (const step of response.steps) {
        const terminalOutput = simulator.executeCommand(step.command);
        setMessages(prev => [...prev, {
          role: 'terminal',
          content: `$ ${step.command}\n${terminalOutput}`,
          timestamp: new Date()
        }]);
      }
      setClusterState({ ...simulator.getState() });
    } catch (error) {
      setMessages(prev => [...prev, {
        role: 'agent',
        content: "Sorry, I ran into an error processing that request.",
        timestamp: new Date()
      }]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTerminalCommand = (command: string) => {
    if (!command.trim()) return;
    
    const output = simulator.executeCommand(command);
    setMessages(prev => [...prev, {
      role: 'terminal',
      content: `$ ${command}\n${output}`,
      timestamp: new Date()
    }]);
    
    setClusterState({ ...simulator.getState() });
  };

  const handlePodAction = (action: string, pod: Pod) => {
    if (action === 'logs') {
      const command = `kubectl logs ${pod.name} -n ${pod.namespace}`;
      const output = simulator.executeCommand(command);
      setMessages(prev => [
        ...prev, 
        { role: 'agent', content: `Opening logs for ${pod.name} in ${activeContext}...`, timestamp: new Date() },
        { role: 'terminal', content: `$ ${command}\n${output}`, timestamp: new Date() }
      ]);
    } else if (action === 'exec') {
      const command = `kubectl exec -it ${pod.name} -n ${pod.namespace} -- /bin/sh`;
      const output = simulator.executeCommand(command);
      setMessages(prev => [
        ...prev, 
        { role: 'agent', content: `Initializing interactive shell in ${pod.name} on ${activeContext}...`, timestamp: new Date() },
        { role: 'terminal', content: `$ ${command}\n${output}`, timestamp: new Date() }
      ]);
    }
    setActiveTab('terminal');
  };

  const handleAddContext = () => {
    const name = prompt('Enter cluster context name:');
    if (name && !contexts.includes(name)) {
      setContexts(prev => [...prev, name]);
      setActiveContext(name);
      setShowContextSelector(false);
      setMessages(prev => [...prev, {
        role: 'agent',
        content: `Switched context to "${name}". I am now monitoring this new environment.`,
        timestamp: new Date()
      }]);
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden">
      {activeToast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] animate-in fade-in slide-in-from-top-4 duration-300">
          <div className={`flex items-center gap-4 px-6 py-4 rounded-2xl shadow-2xl border ${activeToast.severity === 'Critical' ? 'bg-red-50 border-red-200 text-red-900' : 'bg-amber-50 border-amber-200 text-amber-900'} backdrop-blur-md`}>
            {activeToast.severity === 'Critical' ? <AlertCircle className="w-5 h-5 shrink-0 text-red-600" /> : <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600" />}
            <div className="flex flex-col">
              <span className="text-xs font-bold uppercase tracking-wider opacity-70">{activeToast.type} Alert</span>
              <span className="text-sm font-semibold">{activeToast.message}</span>
            </div>
            <button onClick={() => setActiveToast(null)} className="ml-4 hover:opacity-70">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Unified Command Sidebar */}
      <aside className="w-[420px] border-r border-slate-200 bg-white flex flex-col shrink-0 shadow-2xl z-20 overflow-hidden">
        {/* Header Section */}
        <div className="p-6 border-b border-slate-100 flex flex-col gap-4 bg-white/50 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-indigo-600 p-2.5 rounded-2xl shadow-lg shadow-indigo-500/20">
                <Layout className="w-6 h-6 text-white" />
              </div>
              <h1 className="font-black text-xl tracking-tight text-slate-800 uppercase">KubeAgent Pro</h1>
            </div>
            <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/50" />
          </div>

          <nav className="flex p-1 bg-slate-100 rounded-xl">
            <button 
              onClick={() => setActiveTab('topology')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'topology' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <Globe className="w-3.5 h-3.5" /> Topology
            </button>
            <button 
              onClick={() => setActiveTab('terminal')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'terminal' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <Terminal className="w-3.5 h-3.5" /> Terminal
            </button>
          </nav>
        </div>

        {/* Integrated Assistant Section */}
        <div className="flex-1 overflow-hidden relative flex flex-col bg-white">
          <ChatBox 
            messages={messages} 
            onSendMessage={handleUserInput} 
            isProcessing={isProcessing}
            compact
          />
        </div>

        {/* Status & Alerts Section */}
        <div className="p-5 border-t border-slate-100 bg-slate-50/50">
           <div className="flex items-center justify-between mb-4">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Bell className="w-3 h-3" /> Recent Activity
              </h3>
              <div className="flex items-center gap-3 text-[10px] font-bold text-slate-500">
                <span className="flex items-center gap-1"><Database className="w-2.5 h-2.5" /> {clusterState.pods.length} Pods</span>
                <span className="flex items-center gap-1"><Cpu className="w-2.5 h-2.5" /> 3 Nodes</span>
              </div>
           </div>

           <div className="max-h-32 overflow-y-auto space-y-2 custom-scrollbar pr-1">
            {alerts.slice(0, 3).map(alert => (
              <div key={alert.id} className={`p-3 rounded-xl border text-[11px] font-medium leading-snug ${alert.severity === 'Critical' ? 'bg-red-50/50 border-red-100 text-red-700' : 'bg-amber-50/50 border-amber-100 text-amber-700'}`}>
                <div className="flex justify-between items-center opacity-70 text-[9px] font-black uppercase mb-0.5">
                  <span>{alert.type}</span>
                  <span>{alert.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                {alert.message}
              </div>
            ))}
            {alerts.length === 0 && (
              <div className="text-center py-4 text-slate-400 text-[10px] font-bold uppercase tracking-widest italic opacity-50">Monitoring active...</div>
            )}
           </div>
        </div>
      </aside>

      {/* Observation Deck (Main View) */}
      <main className="flex-1 relative flex flex-col min-w-0 bg-slate-100">
        <header className="h-14 bg-white/40 backdrop-blur-md border-b border-slate-200/50 flex items-center justify-between px-8 shrink-0 relative z-30">
          <div className="flex items-center gap-3 relative">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Context:</span>
            <div className="relative">
              <button 
                onClick={() => setShowContextSelector(!showContextSelector)}
                className="group flex items-center gap-2 text-xs font-bold text-slate-700 bg-white/80 px-4 py-1.5 rounded-full border border-slate-200 shadow-sm hover:border-indigo-400 hover:text-indigo-600 transition-all active:scale-95"
              >
                <Layers className="w-3 h-3 text-indigo-500" />
                {activeContext}
                <ChevronRight className={`w-3 h-3 transition-transform duration-300 ${showContextSelector ? 'rotate-90' : 'rotate-0'}`} />
              </button>

              {showContextSelector && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowContextSelector(false)} />
                  <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-2xl border border-slate-200 shadow-2xl py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="px-4 py-2 border-b border-slate-100 mb-1">
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Select Cluster</span>
                    </div>
                    {contexts.map(ctx => (
                      <button
                        key={ctx}
                        onClick={() => {
                          setActiveContext(ctx);
                          setShowContextSelector(false);
                        }}
                        className={`w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold hover:bg-slate-50 transition-colors ${activeContext === ctx ? 'text-indigo-600 bg-indigo-50/50' : 'text-slate-600'}`}
                      >
                        {ctx}
                        {activeContext === ctx && <div className="h-1.5 w-1.5 rounded-full bg-indigo-600" />}
                      </button>
                    ))}
                    <div className="px-2 pt-2 mt-2 border-t border-slate-100">
                      <button 
                        onClick={handleAddContext}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 transition-all"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add New Context
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Active Connection</span>
            </div>
          </div>
        </header>

        <div className="flex-1 relative overflow-hidden">
          {activeTab === 'topology' ? (
            <ClusterView clusterState={clusterState} onAction={handlePodAction} />
          ) : (
            <TerminalView 
              messages={messages.filter(m => m.role === 'terminal')} 
              onExecuteCommand={handleTerminalCommand}
            />
          )}
        </div>
      </main>
    </div>
  );
};

export default App;
