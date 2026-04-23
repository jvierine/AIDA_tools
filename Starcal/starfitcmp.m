starpar = fminsearch(@(startvec) stardiff(startvec,xmin,xmax,ymin,ymax,starmat),startvec);%updstraut.m
starpar = fminsearch(@(startvec) stardiff2(startvec,xmin,xmax,ymin,ymax,starmat-bakgr2,x0,y0),startvec);%autoidentify#1
starpar = fminsearch(@(startvec) stardiff (startvec,xmin,xmax,ymin,ymax,starmat),startvec);%autoidentify#2


