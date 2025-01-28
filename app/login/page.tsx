'use client'

import { signIn } from 'next-auth/react'
import { useState } from 'react'
import { toast } from "sonner"

export default function LoginPage() {
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    
    const res = await signIn('credentials', {
      username: formData.get('username'),
      password: formData.get('password'),
      redirect: true,
      callbackUrl: '/'
    })

    if (res?.error) {
      toast.error("Identifiants invalides")
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <form onSubmit={handleSubmit} className="space-y-4 w-full max-w-md p-8">
        <h1 className="text-2xl font-bold text-center">Connexion</h1>
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-2">
            Nom d'utilisateur
          </label>
          <input
            name="username"
            type="text"
            required
            className="w-full p-2 border rounded"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Mot de passe
          </label>
          <input
            name="password"
            type="password"
            required
            className="w-full p-2 border rounded"
          />
        </div>

        <button
          type="submit"
          className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600"
        >
          Se connecter
        </button>
      </form>
    </div>
  )
} 