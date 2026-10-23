# tools/blender/water_to_blender.py - Crystal Sea surface, lakes and the realm rivers (WATER_20261023) at the game's levels (owner 2026-10-23).
import bpy, bmesh, json, math
from mathutils import Vector
from mathutils.bvhtree import BVHTree
_T=bpy.data.objects['realm_terrain']; _te=_T.evaluated_get(bpy.context.evaluated_depsgraph_get()); _tm=_te.to_mesh(); _bvh=BVHTree.FromPolygons([_T.matrix_world@v.co for v in _tm.vertices],[q.vertices[:] for q in _tm.polygons]); _te.to_mesh_clear()
def gz(x,y):
    h=_bvh.ray_cast(Vector((x,y,3000)),Vector((0,0,-1))); return h[0].z if h[0] else 0
SC=bpy.data.scenes['REALM_VIEW']; T=json.load(open(r'C:/Users/Brittany/Shaddai-3d/public/assets/terrain/terrain.json'))
c=bpy.data.collections.get('WATER_20261023') or bpy.data.collections.new('WATER_20261023')
if c.name not in [x.name for x in SC.collection.children]: SC.collection.children.link(c)
for o in list(c.objects): bpy.data.objects.remove(o, do_unlink=True)
m=bpy.data.materials.get('fin_sea') or bpy.data.materials.new('fin_sea'); m.use_nodes=True
b=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED'); col=(0.02,0.42,0.40,1); b.inputs['Base Color'].default_value=col; b.inputs['Roughness'].default_value=0.05; m.diffuse_color=(0.05,0.55,0.5,0.85)
WL=float(T.get('water_level_m',2))
def obj(name,bm):
    me=bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); me.materials.append(m); o=bpy.data.objects.new(name,me); c.objects.link(o); return o
R=next(r for r in T['realms'] if r['id']=='ocean'); bm=bmesh.new(); c0,c1=R['c0']-2,R['c1']+2; r0,r1=R['r0_m'],R.get('r1_m') or T['rim_m']
outer=[]; inner=[]
a=c0
while a<=c1+1e-6:
    t=math.radians(a); outer.append(bm.verts.new((r1*math.sin(t),r1*math.cos(t),WL))); inner.append(bm.verts.new((r0*math.sin(t),r0*math.cos(t),WL))); a+=1.5
for i in range(len(outer)-1): bm.faces.new((inner[i],outer[i],outer[i+1],inner[i+1]))
obj('crystal_sea',bm)
for w in T['water']:
    if w['type']=='lake':
        bm=bmesh.new(); x,y=w['center_m']; bmesh.ops.create_circle(bm,cap_ends=True,segments=48,radius=w['radius_m']); bmesh.ops.translate(bm,verts=bm.verts,vec=(x,y,w.get('level_m',WL))); obj('lake',bm)
    elif w['type']=='river':
        P=w['path_m']; hw=w.get('width_m',20)/2; bm=bmesh.new(); prev=None
        for i,p in enumerate(P):
            a_=P[max(0,i-1)]; b_=P[min(len(P)-1,i+1)]; dx,dy=b_[0]-a_[0],b_[1]-a_[1]; l=math.hypot(dx,dy) or 1; z=gz(p[0],p[1])+0.4   # follow the carved groove like world-water's auto river level
            row=(bm.verts.new((p[0]-dy/l*hw,p[1]+dx/l*hw,z+0.0)),bm.verts.new((p[0]+dy/l*hw,p[1]-dx/l*hw,z+0.0)))
            if prev: bm.faces.new((prev[0],row[0],row[1],prev[1]))
            prev=row
        obj('terrain_river',bm)
bpy.ops.wm.save_mainfile(); print('water', len(c.objects))

# realm rivers share the city river material
m=bpy.data.materials.get('fin_river')
for o in c.objects:
    if o.name.startswith('terrain_river') and m: o.data.materials.clear(); o.data.materials.append(m)
bpy.ops.wm.save_mainfile()
