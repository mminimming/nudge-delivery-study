"""English-only result figures and saved route geometries; no remote requests."""
from pathlib import Path
import json, math, sys
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection
from matplotlib.patches import Patch
from matplotlib.lines import Line2D

ROOT=Path(__file__).resolve().parent
RESULTS=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else ROOT
OUT=RESULTS/'figures';OUT.mkdir(exist_ok=True)
result=json.loads((RESULTS/'results.json').read_text())
counts=result['design']['counts']
detail_count=max(counts)
fixed=result['design'].get('fleet',{}).get('minimumActiveVehicles')==2
data=json.loads((ROOT.parents[1]/'data/taito-network.json').read_text())
BLUE,TEAL,INK='#597aa5','#169c8c','#243348'
VEHICLES=['#366dad','#dc8240','#8a65ad']
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':10,'axes.spines.top':False,
    'axes.spines.right':False,'axes.spines.left':False,'axes.labelcolor':'#536174',
    'xtick.color':'#536174','ytick.color':'#536174','svg.fonttype':'path',
    'figure.facecolor':'white','axes.facecolor':'white'})

def save(fig,name):
    for ext in ['png','svg']:fig.savefig(OUT/f'{name}.{ext}',dpi=200,facecolor='white')
    plt.close(fig)

fig,axs=plt.subplots(2,2,figsize=(11.5,8))
fig.subplots_adjust(left=.09,right=.97,bottom=.10,top=.88,wspace=.26,hspace=.38)
fig.legend(handles=[Patch(color=BLUE,label='Earliest 2-hour window'),Patch(color=TEAL,label='Flexible window')],
    loc='upper center',bbox_to_anchor=(.5,.995),ncol=2,frameon=False,
    title='Fixed fleet: 2 vehicles per policy' if fixed else None)
metrics=[('distanceKm','Total driving distance','km'),('workMinutes','Total team work time','driver-min'),
    ('maxWorkMinutes','Maximum individual work time','min'),('usedVehicles','Vehicles used','vehicles')]
for ax,(key,title,unit) in zip(axs.flat,metrics):
    vmax=0; labels=[]
    for g,count in enumerate(counts):
        rows=[r for r in result['rows'] if r['count']==count and r['comparable']]
        vals=[[r['policies'][p][key] for r in rows] for p in ['earliest','flexible']]
        for j,v in enumerate(vals):
            x=g*2.2+(j-.5)*.58
            ax.bar(x,np.mean(v),width=.46,color=[BLUE,TEAL][j],alpha=.85,zorder=2)
            offsets=np.linspace(-.105,.105,len(v))
            ax.scatter(x+offsets,v,s=13,color='white',edgecolors=[BLUE,TEAL][j],linewidths=.8,zorder=4)
            labels.append((x,max(v),np.mean(v)));vmax=max(vmax,max(v))
        for i in range(len(rows)):
            offset=np.linspace(-.105,.105,len(rows))[i]
            ax.plot([g*2.2-.29+offset,g*2.2+.29+offset],[vals[0][i],vals[1][i]],color='#a0aaba',alpha=.3,lw=.7,zorder=3)
    for x,y,m in labels:ax.text(x,y+vmax*.05,f'{m:.0f}' if key=='usedVehicles' else f'{m:.1f}',ha='center',fontsize=10,color=INK)
    ax.set_ylim(0,vmax*1.25);ax.set_xlim(-.85,3.05)
    ax.set_xticks([0,2.2],[f'{n} orders' for n in counts]);ax.set_ylabel(unit)
    ax.set_title(title,loc='left',fontsize=12,pad=14,color=INK)
    ax.grid(axis='y',color='#e8ecf1');ax.set_axisbelow(True);ax.tick_params(length=0)
    if key=='usedVehicles':ax.set_yticks([0,1,2])
save(fig,'pilot-summary')

fig,axs=plt.subplots(1,3,figsize=(12,5.5))
fig.subplots_adjust(left=.075,right=.98,bottom=.13,top=.80,wspace=.34)
fig.legend(handles=[Patch(color=BLUE,label='Earliest 2-hour window'),Patch(color=TEAL,label='Flexible window')],
    loc='upper center',bbox_to_anchor=(.5,.98),ncol=2,frameon=False,
    title=f'{detail_count} orders | 2 vehicles per policy' if fixed else f'{detail_count} orders')
rows=sorted([r for r in result['rows'] if r['count']==detail_count and r['comparable']],key=lambda r:r['seed'])
for ax,(key,title,unit) in zip(axs,metrics[:3]):
    for i,r in enumerate(rows):
        a,b=[r['policies'][p][key] for p in ['earliest','flexible']]
        ax.plot([a,b],[i,i],color='#c0c9d5',lw=1.8)
        ax.scatter([a,b],[i,i],c=[BLUE,TEAL],s=32,zorder=3)
    ax.set_yticks(range(10),[f'Seed {r["seed"]:02d}' for r in rows]);ax.set_ylim(9.6,-.6)
    ax.set_xlim(left=0);ax.set_xlabel(unit);ax.set_title(title,fontsize=10.5,pad=13)
    ax.grid(axis='x',color='#e8ecf1');ax.set_axisbelow(True);ax.tick_params(length=0)
save(fig,f'pilot-paired-{detail_count}')

# Use the first predeclared seed, without selecting a favorable result.
# Convert lat/lon to a shared local metric frame (equirectangular approximation).
depot=data['points'][0]
coslat=math.cos(math.radians(depot['lat']))
def xy(lat,lon):return ((lon-depot['lon'])*111.32*coslat,(lat-depot['lat'])*111.32)
nodes=np.array([xy(lat,lon) for lat,lon in data['road_nodes']])
segments=np.array([[nodes[a],nodes[b]] for a,b in data['road_segments']])
dest_indices=[i for i,p in enumerate(data['points']) if p.get('kind')=='destination']
point_labels={idx:f'P{j+1}' for j,idx in enumerate(dest_indices)}
def leg_nodes(a,b):return data['matrix'][a][b]['nodes']
def endpoint(idx):
    ids=leg_nodes(0,idx)
    if idx==0:ids=leg_nodes(0,dest_indices[0])
    return nodes[ids[0] if idx==0 else ids[-1]]
selected={n:next(r for r in result['rows'] if r['count']==n and r['seed']==1) for n in counts}
used_node_ids=[]
for row in selected.values():
    for p in row['policies'].values():
        for route in p['routes']:
            seq=route['run']['pointSequence']
            for a,b in zip(seq,seq[1:]):used_node_ids.extend(leg_nodes(a,b))
route_nodes=nodes[used_node_ids]
lo=route_nodes.min(axis=0)-.23;hi=route_nodes.max(axis=0)+.23

def draw_route(ax,row,policy):
    p=row['policies'][policy]
    ax.add_collection(LineCollection(segments,colors='#e2e6eb',linewidths=.55,zorder=0,rasterized=True))
    for route in p['routes']:
        if not route['stops']:continue
        color=VEHICLES[route['vehicle']-1]
        seq=route['run']['pointSequence']
        for a,b in zip(seq,seq[1:]):
            ids=leg_nodes(a,b)
            if len(ids)<2:continue
            path=nodes[ids]
            ax.plot(path[:,0],path[:,1],color=color,lw=1.9,alpha=.8,zorder=2)
            length=np.linalg.norm(np.diff(path,axis=0),axis=1)
            if length.sum()>.10:
                mid=np.searchsorted(np.cumsum(length),length.sum()*.55)
                axy,bxy=path[mid],path[mid+1]
                vec=bxy-axy;norm=np.linalg.norm(vec)
                if norm>0:
                    start=(axy+bxy)/2-vec/norm*.027;end=(axy+bxy)/2+vec/norm*.027
                    ax.annotate('',xy=end,xytext=start,arrowprops={'arrowstyle':'-|>','color':color,'lw':.8,'mutation_scale':9},zorder=3)
    stops=sorted(set(s['point'] for r in p['routes'] for s in r['stops']))
    for idx in stops:
        x,y=endpoint(idx)
        ax.scatter(x,y,s=25,color='white',edgecolors=INK,linewidths=.8,zorder=5)
        ax.annotate(point_labels[idx],(x,y),xytext=(5,5),textcoords='offset points',fontsize=8,color=INK,zorder=7,
            bbox={'facecolor':'white','edgecolor':'none','alpha':.85,'pad':1})
    x,y=endpoint(0);ax.scatter(x,y,marker='*',s=150,color=INK,edgecolors='white',linewidths=.7,zorder=8)
    ax.annotate('Depot',(x,y),xytext=(7,-13),textcoords='offset points',fontsize=8,color=INK,zorder=9)
    ax.set_xlim(lo[0],hi[0]);ax.set_ylim(lo[1],hi[1]);ax.set_aspect('equal');ax.axis('off')
    # Shared scale and north indication.
    sx,sy=lo[0]+.12,lo[1]+.12
    ax.plot([sx,sx+.5],[sy,sy],color=INK,lw=2);ax.text(sx+.25,sy+.035,'500 m',ha='center',fontsize=8,color=INK)
    nx,ny=hi[0]-.15,hi[1]-.30
    ax.annotate('N',xy=(nx,ny+.15),xytext=(nx,ny-.02),ha='center',fontsize=9,color=INK,
        arrowprops={'arrowstyle':'-|>','color':INK,'lw':1})
    name='Earliest 2-hour window' if policy=='earliest' else 'Flexible window'
    ax.set_title(f'{name}\n{p["distanceKm"]:.2f} km  |  {p["usedVehicles"]} vehicle'+('s' if p['usedVehicles']!=1 else ''),fontsize=12,pad=12,color=INK)

legend=[Line2D([0],[0],color=c,lw=2,label=f'Vehicle {i+1}') for i,c in enumerate(VEHICLES[:2])]
for n,row in selected.items():
    fig,axs=plt.subplots(1,2,figsize=(12,7))
    fig.subplots_adjust(left=.02,right=.98,bottom=.09,top=.83,wspace=.06)
    fig.suptitle(f'Delivery routes | {n} orders | Seed 01',fontsize=15,y=.97,color=INK)
    for ax,policy in zip(axs,['earliest','flexible']):draw_route(ax,row,policy)
    fig.legend(handles=legend,loc='upper center',bbox_to_anchor=(.5,.935),ncol=2,frameon=False)
    fig.text(.025,.025,'Road geometry: © OpenStreetMap contributors | ODbL 1.0',fontsize=8,color='#697485')
    save(fig,f'pilot-routes-{n}')
    for policy in ['earliest','flexible']:
        fig,ax=plt.subplots(figsize=(7,7))
        fig.subplots_adjust(left=.03,right=.97,bottom=.08,top=.82)
        fig.suptitle(f'{n} orders | Seed 01',fontsize=13,y=.98,color=INK)
        draw_route(ax,row,policy)
        fig.legend(handles=legend,loc='upper center',bbox_to_anchor=(.5,.93),ncol=2,frameon=False)
        fig.text(.03,.025,'© OpenStreetMap contributors | ODbL 1.0',fontsize=8,color='#697485')
        save(fig,f'route-{n}-{policy}')
print('English figures and four individual policy-route maps exported.')
