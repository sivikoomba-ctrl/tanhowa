"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Shield, Phone, Mail } from "lucide-react";

interface AdminContact {
  id: string;
  name: string;
  email: string;
  phone: string;
  photo_url: string;
  occupation: string;
}

interface AdminContactsProps {
  contacts: AdminContact[];
}

export function AdminContacts({ contacts }: AdminContactsProps) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-5 h-5 text-primary" />
          <h2 className="text-sm font-semibold">Admin Contacts</h2>
        </div>
        <div className="space-y-2">
          {contacts.map((a) => (
            <div key={a.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors">
              <Avatar className="w-9 h-9">
                {a.photo_url && <AvatarImage src={a.photo_url} alt={a.name} />}
                <AvatarFallback className="bg-primary/10 text-primary font-semibold text-xs">
                  {a.name?.charAt(0)?.toUpperCase() || "?"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate uppercase">{a.name || "Admin"}</p>
                {a.occupation && <p className="text-[10px] text-muted-foreground">{a.occupation}</p>}
                <div className="flex flex-wrap items-center gap-x-3 mt-0.5">
                  {a.phone && (
                    <a href={`tel:${a.phone}`} className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline">
                      <Phone size={9} /> {a.phone}
                    </a>
                  )}
                  <a href={`mailto:${a.email}`} className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline">
                    <Mail size={9} /> {a.email}
                  </a>
                </div>
              </div>
            </div>
          ))}
          {contacts.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No admin contacts found</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
