# Dev helper (not shipped): carves the Saltline layout into an ASCII grid and checks connectivity.
W, H = 56, 44
g = [['#'] * W for _ in range(H)]
def rect(c0, r0, c1, r1, ch='.'):
    for r in range(r0, r1 + 1):
        for c in range(c0, c1 + 1):
            g[r][c] = ch
def put(c, r, ch): g[r][c] = ch

# open spaces
rect(20, 1, 35, 6)      # defender spawn (Pumphouse yard)
rect(8, 3, 19, 5)       # B link
rect(2, 7, 16, 17)      # B site (Evaporator hall)
rect(9, 6, 11, 6)       # B north door
rect(36, 3, 47, 5)      # A link
rect(39, 7, 53, 17)     # A site (Brine tanks)
rect(44, 6, 46, 6)      # A north door
rect(26, 7, 29, 13)     # mid gate
rect(22, 14, 33, 30)    # mid yard (Conveyor yard)
rect(34, 14, 38, 16)    # catwalk to A
rect(12, 20, 21, 22)    # vent hall to B
rect(12, 18, 14, 19)    # vent door into B
rect(4, 34, 19, 37)     # sluice south
rect(3, 19, 7, 33)      # sluice lane
rect(4, 18, 6, 18)      # sluice door into B
rect(36, 34, 51, 37)    # dock south
rect(47, 19, 52, 33)    # long dock lane
rect(48, 18, 50, 18)    # long door into A
rect(20, 36, 35, 42)    # attacker spawn (Rail yard)
rect(25, 31, 30, 35)    # lower mid

for line in open(__file__.replace('carve_map.py', 'map_cover.txt')).read().splitlines():
    if not line.strip() or line.startswith(';'): continue
    ch, c, r = line.split()
    put(int(c), int(r), ch)

def tall(c0, r0, c1, r1):
    for r in range(r0, r1 + 1):
        for c in range(c0, c1 + 1):
            if g[r][c] == '#': g[r][c] = 'H'
tall(18, 7, 24, 16)     # evaporator building between B and mid
tall(31, 7, 37, 12)     # control house between mid and A
tall(35, 18, 45, 32)    # salt silo block between mid and long dock
tall(9, 23, 20, 32)     # warehouse between sluice and mid
rows = [''.join(r) for r in g]
print('\n'.join(rows))
# connectivity: BFS over non-wall/non-tall cells from attacker spawn
walk = lambda ch: ch not in '#XH'
from collections import deque
start = next((c, r) for r in range(H) for c in range(W) if g[r][c] == 'a')
seen = {start}; q = deque([start])
while q:
    c, r = q.popleft()
    for dc, dr in ((1,0),(-1,0),(0,1),(0,-1)):
        n = (c + dc, r + dr)
        if 0 <= n[0] < W and 0 <= n[1] < H and n not in seen and walk(g[n[1]][n[0]]):
            seen.add(n); q.append(n)
unreached = [(c, r, g[r][c]) for r in range(H) for c in range(W) if walk(g[r][c]) and (c, r) not in seen]
print('unreached:', unreached[:20])
assert all(len(r) == W for r in rows)
