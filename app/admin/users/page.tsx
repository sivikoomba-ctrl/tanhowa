"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Check, X, Shield, Trash2 } from "lucide-react";

interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  occupation: string;
  role: string;
  status: string;
  created_at: string;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [tab, setTab] = useState("pending");

  function loadUsers() {
    fetch("/api/users?status=" + (tab === "all" ? "" : tab))
      .then((r) => r.json())
      .then((d) => setUsers(d.users || []))
      .catch(() => {});
  }

  useEffect(() => {
    loadUsers();
  }, [tab]);

  async function handleAction(userId: string, action: string, role?: string) {
    const res = await fetch("/api/admin/users", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, action, role }),
    });

    if (res.ok) {
      toast.success(`User ${action}d successfully`);
      loadUsers();
    } else {
      toast.error("Action failed");
    }
  }

  async function handleDelete(userId: string) {
    if (!confirm("Are you sure you want to delete this user?")) return;

    const res = await fetch(`/api/admin/users?userId=${userId}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("User deleted");
      loadUsers();
    } else {
      const data = await res.json();
      toast.error(data.error || "Delete failed");
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Manage Users</h1>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          {users.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center">No {tab} users</p>
          ) : (
            <div className="space-y-3">
              {users.map((u) => (
                <Card key={u.id}>
                  <CardContent className="pt-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{u.name || "Unnamed"}</h3>
                          <Badge variant={u.role === "admin" ? "default" : "outline"} className="text-xs">
                            {u.role}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{u.email}</p>
                        {u.occupation && <p className="text-xs text-muted-foreground">{u.occupation}</p>}
                        <p className="text-xs text-muted-foreground mt-1">
                          Joined: {new Date(u.created_at).toLocaleDateString()}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {tab === "pending" && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => handleAction(u.id, "approve")}
                              className="bg-primary hover:bg-primary/90"
                            >
                              <Check size={14} className="mr-1" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleAction(u.id, "reject")}
                            >
                              <X size={14} className="mr-1" />
                              Reject
                            </Button>
                          </>
                        )}
                        {tab === "approved" && u.role !== "admin" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleAction(u.id, "set-role", "admin")}
                          >
                            <Shield size={14} className="mr-1" />
                            Make Admin
                          </Button>
                        )}
                        {tab === "approved" && u.role === "admin" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleAction(u.id, "set-role", "member")}
                          >
                            Remove Admin
                          </Button>
                        )}
                        {tab === "rejected" && (
                          <Button
                            size="sm"
                            onClick={() => handleAction(u.id, "approve")}
                            className="bg-primary hover:bg-primary/90"
                          >
                            <Check size={14} className="mr-1" />
                            Approve
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDelete(u.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
