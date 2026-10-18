import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import {
  ShieldAlert,
  Smartphone,
  Users,
  Activity,
  Search,
  RefreshCw,
  Battery,
  AlertTriangle,
  Lock,
  ChevronRight,
  ExternalLink,
  ShieldCheck,
  Zap
} from "lucide-react";
import Navbar from "./Navbar";
import { apiUrl } from "../lib/api";

interface AdminStats {
  totalDevices: number;
  totalUsers: number;
  active24h: number;
  stolenActive: number;
  totalLogsCaptured: number;
}

interface AdminDevice {
  id: string;
  userId: string;
  deviceName: string;
  deviceModel: string;
  fcmToken: boolean;
  registeredSimSerial: string;
  isStolen: boolean;
  requestLocate: boolean;
  requestSiren: boolean;
  battery: number | null;
  lastSeenAt: string | null;
  lastTelemetry: {
    lat: number;
    lng: number;
    accuracy: number;
    battery: number;
    trigger: string;
  } | null;
}

interface AdminUser {
  id: string;
  fullName: string;
  email: string;
  phoneNumber: string;
  emergencyContactPhone: string;
  createdAt: string | null;
}

interface AdminLog {
  id: string;
  deviceId: string;
  userId: string;
  triggerReason: string;
  battery: number | null;
  timestamp: string | null;
  accuracy: number | null;
}

interface AdminConsoleProps {
  user: User;
  onExitAdmin: () => void;
  onSwitchToDownload: () => void;
}

export default function AdminConsole({ user, onExitAdmin, onSwitchToDownload }: AdminConsoleProps) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [devices, setDevices] = useState<AdminDevice[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [recentLogs, setRecentLogs] = useState<AdminLog[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"devices" | "users" | "telemetry">("devices");

  // User edit modal state
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [editEmergencyPhone, setEditEmergencyPhone] = useState("");
  const [editFullName, setEditFullName] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editNotice, setEditNotice] = useState<string | null>(null);

  const fetchAdminData = async () => {
    setLoading(true);
    setError(null);
    try {
      const idToken = await user.getIdToken(true);
      const res = await fetch(apiUrl("/api/admin/stats"), {
        headers: {
          Authorization: `Bearer ${idToken}`
        }
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setStats(data.stats);
      setDevices(data.devices || []);
      setUsers(data.users || []);
      setRecentLogs(data.recentLogs || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load admin stats");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, []);

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setEditSaving(true);
    setEditNotice(null);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch(apiUrl("/api/admin/update-user"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`
        },
        body: JSON.stringify({
          targetUserId: editingUser.id,
          updates: {
            emergencyContactPhone: editEmergencyPhone,
            fullName: editFullName
          }
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Update failed");

      setEditNotice("User profile updated successfully.");
      // Update local state
      setUsers((prev) =>
        prev.map((u) =>
          u.id === editingUser.id
            ? { ...u, emergencyContactPhone: editEmergencyPhone, fullName: editFullName }
            : u
        )
      );
      setTimeout(() => {
        setEditingUser(null);
        setEditNotice(null);
      }, 1200);
    } catch (err) {
      setEditNotice(err instanceof Error ? err.message : "Error updating user");
    } finally {
      setEditSaving(false);
    }
  };

  const filteredDevices = devices.filter((d) => {
    const q = searchQuery.toLowerCase();
    return (
      d.deviceName.toLowerCase().includes(q) ||
      d.deviceModel.toLowerCase().includes(q) ||
      d.id.toLowerCase().includes(q) ||
      d.userId.toLowerCase().includes(q)
    );
  });

  const filteredUsers = users.filter((u) => {
    const q = searchQuery.toLowerCase();
    return (
      u.fullName.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.phoneNumber.toLowerCase().includes(q) ||
      u.emergencyContactPhone.toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-[#070B14] text-[#EDEDED] font-sans antialiased selection:bg-[#00F29D] selection:text-[#070B14]">
      {/* Top Navbar */}
      <Navbar
        currentTab="track"
        onSwitchTab={(tab) => {
          if (tab === "download") onSwitchToDownload();
          else onExitAdmin();
        }}
        user={user}
      />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#00F29D]/15 text-[#00F29D] border border-[#00F29D]/30 uppercase tracking-widest">
                INTERNAL
              </span>
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white flex items-center gap-2">
                Track<span className="text-[#00F29D]">d</span> Admin Console
              </h1>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Live device fleet status, install telemetry, and user rescue tools.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchAdminData}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-300 hover:text-white transition"
              title="Refresh console data"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-[#00F29D]" : ""}`} />
              <span>Refresh</span>
            </button>
            <button
              onClick={onExitAdmin}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#00F29D]/15 hover:bg-[#00F29D]/25 border border-[#00F29D]/40 text-xs font-semibold text-[#00F29D] transition"
            >
              <span>Back to Radar</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-950/20 p-4 text-xs text-red-200 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <strong className="font-semibold text-red-400">Access Restricted or Error</strong>
              <p className="mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* Top Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <div className="p-4 rounded-2xl bg-[#0D1322] border border-white/10 shadow-lg relative overflow-hidden">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
              <span>Total Installs</span>
              <Smartphone className="w-4 h-4 text-[#00F29D]" />
            </div>
            <div className="text-2xl font-black text-white">{stats ? stats.totalDevices : "—"}</div>
            <p className="text-[11px] text-slate-500 mt-1">Registered Android handsets</p>
          </div>

          <div className="p-4 rounded-2xl bg-[#0D1322] border border-white/10 shadow-lg relative overflow-hidden">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
              <span>Active (24h)</span>
              <Activity className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-black text-emerald-400">{stats ? stats.active24h : "—"}</div>
            <p className="text-[11px] text-slate-500 mt-1">Checked in recently</p>
          </div>

          <div className="p-4 rounded-2xl bg-[#0D1322] border border-white/10 shadow-lg relative overflow-hidden">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
              <span>Stolen Lock Active</span>
              <ShieldAlert className="w-4 h-4 text-rose-400" />
            </div>
            <div className="text-2xl font-black text-rose-400">{stats ? stats.stolenActive : "—"}</div>
            <p className="text-[11px] text-slate-500 mt-1">Devices currently locked</p>
          </div>

          <div className="p-4 rounded-2xl bg-[#0D1322] border border-white/10 shadow-lg relative overflow-hidden">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
              <span>Total Accounts</span>
              <Users className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-2xl font-black text-white">{stats ? stats.totalUsers : "—"}</div>
            <p className="text-[11px] text-slate-500 mt-1">Registered owners</p>
          </div>
        </div>

        {/* Tab Selector & Search Filter */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#0D1322] border border-white/10 w-fit">
            <button
              onClick={() => setActiveTab("devices")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === "devices"
                  ? "bg-[#00F29D] text-[#070B14] font-bold shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Devices ({devices.length})
            </button>
            <button
              onClick={() => setActiveTab("users")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === "users"
                  ? "bg-[#00F29D] text-[#070B14] font-bold shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Users ({users.length})
            </button>
            <button
              onClick={() => setActiveTab("telemetry")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === "telemetry"
                  ? "bg-[#00F29D] text-[#070B14] font-bold shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Live Events ({recentLogs.length})
            </button>
          </div>

          {/* Search box */}
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search devices or users…"
              className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-[#0D1322] border border-white/10 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#00F29D]"
            />
          </div>
        </div>

        {/* TAB 1: DEVICES */}
        {activeTab === "devices" && (
          <div className="rounded-2xl bg-[#0D1322] border border-white/10 overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-white/5 border-b border-white/10 text-slate-400 font-mono text-[11px]">
                  <tr>
                    <th className="p-3.5">Device & Model</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5">Battery</th>
                    <th className="p-3.5">Last Coordinates</th>
                    <th className="p-3.5">Last Seen</th>
                    <th className="p-3.5">FCM Push</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-sans">
                  {filteredDevices.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-500">
                        No devices matched your query.
                      </td>
                    </tr>
                  ) : (
                    filteredDevices.map((dev) => (
                      <tr key={dev.id} className="hover:bg-white/[0.02] transition">
                        <td className="p-3.5">
                          <div className="font-semibold text-white">{dev.deviceName}</div>
                          <div className="font-mono text-[11px] text-slate-400">{dev.deviceModel}</div>
                          <div className="font-mono text-[10px] text-slate-500 truncate max-w-[150px]">
                            {dev.id}
                          </div>
                        </td>

                        <td className="p-3.5">
                          {dev.isStolen ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                              <Lock className="w-3 h-3" />
                              STOLEN LOCKED
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                              <ShieldCheck className="w-3 h-3" />
                              Armed & Safe
                            </span>
                          )}
                        </td>

                        <td className="p-3.5">
                          <div className="flex items-center gap-1.5 font-mono text-slate-300">
                            <Battery className="w-3.5 h-3.5 text-slate-400" />
                            <span>{dev.battery != null ? `${dev.battery}%` : "—"}</span>
                          </div>
                        </td>

                        <td className="p-3.5">
                          {dev.lastTelemetry?.lat != null ? (
                            <div>
                              <a
                                href={`https://www.google.com/maps?q=${dev.lastTelemetry.lat},${dev.lastTelemetry.lng}`}
                                target="_blank"
                                rel="noreferrer"
                                className="font-mono text-[11px] text-[#00F29D] hover:underline flex items-center gap-1"
                              >
                                <span>
                                  {dev.lastTelemetry.lat.toFixed(4)}, {dev.lastTelemetry.lng.toFixed(4)}
                                </span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                              <div className="text-[10px] text-slate-500 font-mono">
                                ±{Math.round(dev.lastTelemetry.accuracy)}m ({dev.lastTelemetry.trigger})
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-500 font-mono text-[11px]">No GPS fix</span>
                          )}
                        </td>

                        <td className="p-3.5 text-slate-400 text-[11px] font-mono">
                          {dev.lastSeenAt ? new Date(dev.lastSeenAt).toLocaleString() : "Never"}
                        </td>

                        <td className="p-3.5">
                          {dev.fcmToken ? (
                            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400" title="FCM Token Active" />
                          ) : (
                            <span className="inline-block w-2 h-2 rounded-full bg-slate-600" title="No FCM Token" />
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: USERS */}
        {activeTab === "users" && (
          <div className="rounded-2xl bg-[#0D1322] border border-white/10 overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-white/5 border-b border-white/10 text-slate-400 font-mono text-[11px]">
                  <tr>
                    <th className="p-3.5">Owner Name</th>
                    <th className="p-3.5">Email</th>
                    <th className="p-3.5">Owner Phone</th>
                    <th className="p-3.5">Emergency Contact</th>
                    <th className="p-3.5">Joined</th>
                    <th className="p-3.5 text-right">Support Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-sans">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-500">
                        No registered users found.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => (
                      <tr key={u.id} className="hover:bg-white/[0.02] transition">
                        <td className="p-3.5 font-semibold text-white">{u.fullName}</td>
                        <td className="p-3.5 font-mono text-slate-300">{u.email}</td>
                        <td className="p-3.5 font-mono text-slate-400">{u.phoneNumber || "—"}</td>
                        <td className="p-3.5 font-mono text-amber-300">
                          {u.emergencyContactPhone || "—"}
                        </td>
                        <td className="p-3.5 text-slate-400 text-[11px] font-mono">
                          {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}
                        </td>
                        <td className="p-3.5 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingUser(u);
                              setEditEmergencyPhone(u.emergencyContactPhone || "");
                              setEditFullName(u.fullName || "");
                              setEditNotice(null);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-semibold text-[#00F29D] transition"
                          >
                            Edit / Rescue
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: TELEMETRY LOGS */}
        {activeTab === "telemetry" && (
          <div className="rounded-2xl bg-[#0D1322] border border-white/10 overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-white/5 border-b border-white/10 text-slate-400 font-mono text-[11px]">
                  <tr>
                    <th className="p-3.5">Timestamp</th>
                    <th className="p-3.5">Trigger Reason</th>
                    <th className="p-3.5">Device ID</th>
                    <th className="p-3.5">Battery</th>
                    <th className="p-3.5">Accuracy</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-sans">
                  {recentLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-slate-500">
                        No telemetry triggers recorded yet.
                      </td>
                    </tr>
                  ) : (
                    recentLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-white/[0.02] transition">
                        <td className="p-3.5 font-mono text-slate-400 text-[11px]">
                          {log.timestamp ? new Date(log.timestamp).toLocaleString() : "—"}
                        </td>
                        <td className="p-3.5">
                          <span className="inline-flex items-center gap-1 font-mono font-bold text-[11px] text-[#00F29D]">
                            <Zap className="w-3 h-3 text-[#00F29D]" />
                            {log.triggerReason}
                          </span>
                        </td>
                        <td className="p-3.5 font-mono text-slate-300 text-[11px]">{log.deviceId}</td>
                        <td className="p-3.5 font-mono text-slate-400">
                          {log.battery != null ? `${log.battery}%` : "—"}
                        </td>
                        <td className="p-3.5 font-mono text-slate-500">
                          {log.accuracy != null ? `±${Math.round(log.accuracy)}m` : "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* User Edit / Rescue Modal */}
        {editingUser && (
          <div className="fixed inset-0 z-[1400] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-3xl bg-[#0D1322] border border-white/10 p-6 space-y-4 shadow-2xl relative">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-base font-bold text-white">Rescue / Update Account</h3>
                  <p className="text-[11px] text-slate-400">{editingUser.email}</p>
                </div>
                <button
                  onClick={() => setEditingUser(null)}
                  className="text-slate-400 hover:text-white text-sm"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveUser} className="space-y-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-300">Full Name</span>
                  <input
                    type="text"
                    value={editFullName}
                    onChange={(e) => setEditFullName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#070B14] border border-white/10 text-xs text-white focus:outline-none focus:border-[#00F29D]"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-300">
                    Emergency Contact Phone (E.164)
                  </span>
                  <input
                    type="text"
                    value={editEmergencyPhone}
                    onChange={(e) => setEditEmergencyPhone(e.target.value)}
                    placeholder="+233XXXXXXXXX"
                    className="w-full px-3 py-2 rounded-xl bg-[#070B14] border border-white/10 text-xs text-white focus:outline-none focus:border-[#00F29D]"
                  />
                </label>

                {editNotice && (
                  <p className="text-xs p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
                    {editNotice}
                  </p>
                )}

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingUser(null)}
                    className="flex-1 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs text-slate-300 font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={editSaving}
                    className="flex-1 py-2 rounded-xl bg-gradient-to-r from-[#00F29D] to-[#00DCA0] text-[#070B14] font-bold text-xs shadow-md shadow-[#00F29D]/20 disabled:opacity-50"
                  >
                    {editSaving ? "Saving…" : "Save Changes"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
