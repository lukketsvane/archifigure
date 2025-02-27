"use client";

import { useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Avatar } from "@/components/ui/avatar";
import { User, LogOut } from "lucide-react";

export function UserAuthNav() {
  const { data: session, status } = useSession();
  const [isLoading, setIsLoading] = useState(false);
  
  const handleSignOut = async () => {
    setIsLoading(true);
    try {
      await signOut({ callbackUrl: "/" });
    } catch (error) {
      console.error("Error signing out", error);
    } finally {
      setIsLoading(false);
    }
  };
  
  if (status === "loading") {
    return (
      <Button variant="ghost" size="sm" disabled>
        <span className="w-8 h-8 rounded-full bg-gray-200 animate-pulse"></span>
      </Button>
    );
  }

  if (status === "unauthenticated") {
    return (
      <Button asChild variant="ghost" size="sm">
        <Link href="/signin">
          Sign In
        </Link>
      </Button>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="relative h-8 w-8 rounded-full">
          {session?.user?.image ? (
            <Avatar className="h-8 w-8">
              <img
                src={session.user.image}
                alt={session.user.name || "User"}
                className="h-8 w-8 rounded-full"
              />
            </Avatar>
          ) : (
            <User className="h-4 w-4" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56" align="end">
        <div className="grid gap-4">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium">{session?.user?.name}</p>
            <p className="text-xs text-gray-500">{session?.user?.email}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="flex items-center"
            onClick={handleSignOut}
            disabled={isLoading}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}