"use client"

import React, { useState, useEffect } from "react"
import { Send } from "lucide-react"

interface PasswordLockProps {
  children: React.ReactNode
}

export default function PasswordLock({ children }: PasswordLockProps) {
  const [password, setPassword] = useState("")
  const [authenticated, setAuthenticated] = useState(false)

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
      <div className="flex min-h-screen items-center justify-center">
        <form onSubmit={handleSubmit} className="flex items-center gap-2 border border-black rounded p-4">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter password"
            className="px-4 py-2 border border-black rounded focus:outline-none"
          />
          <button type="submit" className="p-2 border border-black rounded">
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    )
  }

  return <>{children}</>
}
