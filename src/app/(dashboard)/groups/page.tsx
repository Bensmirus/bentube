import { Suspense } from 'react'
import GroupsContent from '@/components/groups/GroupsContent'

export const metadata = {
  title: 'Groups | Ben.Tube',
}

export default function GroupsPage() {
  return (
    <Suspense fallback={<GroupsLoading />}>
      <GroupsContent />
    </Suspense>
  )
}

function GroupsLoading() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
    </div>
  )
}
