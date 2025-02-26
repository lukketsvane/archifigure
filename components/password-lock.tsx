"use client"

import React, { useState, useEffect } from "react"
import { Send } from "lucide-react"
import { useTheme } from "@/components/theme-provider"

interface PasswordLockProps {
  children: React.ReactNode
}

export default function PasswordLock({ children }: PasswordLockProps) {
  const [password, setPassword] = useState("")
  const [authenticated, setAuthenticated] = useState(false)
  const { theme } = useTheme()
  const isDarkMode = theme === "dark"

  useEffect(() => {
    const auth = localStorage.getItem("passwordAuthenticated")
    if (auth === "true") {
      setAuthenticated(true)
    }
  }, [])

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (password === "jegvilha3d") {
      setAuthenticated(true)
      localStorage.setItem("passwordAuthenticated", "true")
    } else {
      alert("Incorrect password")
    }
  }

  if (!authenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <form 
          onSubmit={handleSubmit} 
          className="flex items-center gap-2 border rounded p-4 bg-background"
        >
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Skriv inn passord"
            className={`px-4 py-2 border rounded focus:outline-none ${
              isDarkMode 
                ? "bg-slate-800 text-white border-slate-600 placeholder-slate-400" 
                : "bg-white text-black border-black placeholder-gray-500"
            }`}
          />
          <button 
            type="submit" 
            className={`p-2 border rounded ${
              isDarkMode 
                ? "bg-slate-800 border-slate-600 text-white hover:bg-slate-700" 
                : "bg-white border-black text-black hover:bg-gray-100"
            }`}
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    )
  }

  return <>{children}</>
}