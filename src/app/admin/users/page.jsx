"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const roles = ["user", "admin", "super_admin"];

export default function AdminUsersPage() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [users, setUsers] = useState([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const canManageElevated = me?.role === "super_admin";
  const allowedCreateRoles = useMemo(() => (canManageElevated ? roles : ["user"]), [canManageElevated]);

  async function load() {
    setLoading(true);
    setError("");
    const [meRes, usersRes] = await Promise.all([fetch("/api/auth/me"), fetch("/api/admin/users")]);
    if (meRes.status === 401 || usersRes.status === 401) {
      router.push("/login");
      return;
    }
    if (usersRes.status === 403) {
      router.push("/");
      return;
    }
    const meData = await meRes.json();
    const usersData = await usersRes.json();
    setMe(meData.profile);
    setUsers(usersData.users ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function createUser(e) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, role }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Could not create user.");
      return;
    }
    setUsers((current) => [data.user, ...current]);
    setEmail("");
    setPassword("");
    setRole("user");
  }

  async function updateUser(id, changes) {
    setError("");
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(changes),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Could not update user.");
      return;
    }
    setUsers((current) => current.map((user) => (user.id === id ? data.user : user)));
  }

  if (loading) return <div className="p-8 text-sm text-slate-500">Loading users...</div>;

  return (
    <div className="px-8 py-8 max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1a2b4a]">User Management</h1>
        <p className="text-sm text-slate-500 mt-1">Create users, manage roles, and disable access.</p>
      </div>

      <form onSubmit={createUser} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm grid gap-3 md:grid-cols-[1fr_1fr_180px_auto] items-end">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Email</label>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Temporary password</label>
          <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Role</label>
          <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500">
            {allowedCreateRoles.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
        <button className="bg-sky-500 hover:bg-sky-600 text-white font-semibold px-4 py-2 rounded-lg text-sm">Create</button>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-100 text-left">
            <tr>
              <th className="px-5 py-3 text-xs font-semibold text-slate-500">Email</th>
              <th className="px-5 py-3 text-xs font-semibold text-slate-500">Role</th>
              <th className="px-5 py-3 text-xs font-semibold text-slate-500">Status</th>
              <th className="px-5 py-3 text-xs font-semibold text-slate-500 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((user) => {
              const isSelf = user.id === me?.id;
              const canEditRole = canManageElevated;
              const canDisable = !isSelf && (canManageElevated ? user.role !== "super_admin" : user.role === "user");
              return (
                <tr key={user.id}>
                  <td className="px-5 py-3 font-medium text-slate-700">{user.email}</td>
                  <td className="px-5 py-3">
                    {canEditRole ? (
                      <select value={user.role} onChange={(e) => updateUser(user.id, { role: e.target.value })} className="border border-slate-300 rounded-lg px-2 py-1 text-xs bg-white">
                        {roles.map((item) => <option key={item} value={item}>{item}</option>)}
                      </select>
                    ) : (
                      <span className="text-slate-600">{user.role}</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${user.is_active ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                      {user.is_active ? "Active" : "Disabled"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      disabled={!canDisable && user.is_active}
                      onClick={() => updateUser(user.id, { is_active: !user.is_active })}
                      className="text-xs font-semibold text-slate-600 hover:text-sky-600 disabled:text-slate-300 disabled:cursor-not-allowed"
                    >
                      {user.is_active ? "Disable" : "Reactivate"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
