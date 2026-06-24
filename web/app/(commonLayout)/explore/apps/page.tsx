import AppList from '@/app/components/explore/app-list'

type AppsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

const Apps = (_props: AppsPageProps) => {
  return <AppList />
}

export default Apps
