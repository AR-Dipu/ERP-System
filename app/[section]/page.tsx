import {notFound} from 'next/navigation';
import { loadData } from '@/lib/data';
import { Workspace } from '@/components/workspace';
export const dynamic='force-dynamic';
export default async function Section({params}:{params:Promise<{section:string}>}) {const {section}=await params;if(!['dashboard','products','companies','stock','team','setup'].includes(section))notFound();const data=await loadData();if(section==='team'&&data.role!=='admin')notFound();return <Workspace section={section} data={data}/>;}
