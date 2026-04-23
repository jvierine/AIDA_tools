function [ok] = plotgrid(az0,ze0,rot0,date,utc,lat,long,radecl_or_azze)
% PLOTGRID - plots Azimuth-Zenith or Rect acsention-Declination grid. 
% This function sure show some strange features. 
% "Private" function called automatically from the skymap GUI.
% radecl_or_azze == 1 gives az-zenith grid.
% 
% Calling
% [ok] = plotgrid(az0,ze0,rot0,date,utc,lat,long,radecl_or_azze)


%   Copyright © 20200918 Bjorn Gustavsson, <bjorn.gustavsson@uit.no>
%   This is free software, licensed under GNU GPL version 2 or later
%
%   Copyright © 19990222 Bjorn Gustavsson, <bjorn.gustavsson@irf.se>
%   This is free software, licensed under GNU GPL version 2 or later


unhold = 0;

if ( ~ishold )
  
  hold on
  unhold = 1;
  
end
hold on

[e1,e2,e3] = starbas(az0,-ze0,-rot0);

if ( radecl_or_azze == 1 )
  
  az = 0:10:360;                                
  ze = 0:10:80;
  [az,ze] = meshgrid(az,ze);
  
else
  
  ra = 0:24;
  decl = -80:10:80;
  [ra,decl] = meshgrid(ra,decl);
  %for i = 1:size(ra,1),
  for i = size(ra,1):-1:1
    [az(:,i),ze(:,i)] = starpos2(ra(i,:)',decl(i,:)',date,utc,lat,long);
  end
  az = az'*180/pi+180;
  ze = ze'*180/pi;
  [I,J] = find(ze>85);
  for i = 1:length(I)
    ze(I(i),J(i)) = nan;
  end
  
end


for i = size(az,1):-1:1
  [gfi(i,:),gtaeta(i,:)] = starbestaemft2(az(i,:)',90-ze(i,:)',e1,e2,e3);
end
[qwi,qwj] = find(del2(gtaeta*180/pi)>15);
[I,J] = find(gtaeta<0);
for i = 1:length(I)
  gtaeta(I(i),J(i)) = nan;
end

for i = length(qwi):-1:1
  gtaeta(qwi(i),qwj(i)) = nan;
  gfi(qwi(i),qwj(i)) = nan;
end
% as = text(-1e5,-1e5,'qw');
C = get(gcf,'color');
as = sum(C);
if ( as < .5 )
  c = [1 1 1]*3/4;
else
  c = [1 1 1]*1/4;
end
ph = polar(real(gfi(2:end,:)),real(gtaeta(2:end,:))*180/pi);
set(ph,'color',c)
ph = polar(real(gfi'),real(gtaeta')*180/pi);
set(ph,'color',c)

ax = axis;

if ( radecl_or_azze == 1 )
  
  polar(real(gfi(2:end,19)),real(gtaeta(2:end,19))*180/pi,'r')
  tx = 180/pi*gtaeta(:,ceil(3*end/4)).*cos(gfi(:,ceil(3*end/4)))-1;
  ty = 180/pi*gtaeta(:,ceil(3*end/4)).*sin(gfi(:,ceil(3*end/4)))-1;
  txtstr = num2str(ze(:,ceil(3*end/4)));
  I = find(ty>ax(3));
  
  tx = tx(I);
  ty = ty(I);
  txtstr = txtstr(I,:);
  I = find(ty<ax(4));
  tx = tx(I);
  ty = ty(I);
  txtstr = txtstr(I,:);
  I = find(tx>ax(1));
  tx = tx(I);
  ty = ty(I);
  txtstr = txtstr(I,:);
  I = find(tx<ax(2));
  tx = tx(I);
  ty = ty(I);
  txtstr = txtstr(I,:);
  text(tx(3:end),ty(3:end),txtstr(3:end,:),'color',c,'fontweight','bold')
  if max(size(tx)>1)
    text(tx(2),ty(2),num2str(az(2,ceil(3*end/4))),'color',c,'fontweight','bold')
  end
  
  tx = 180/pi*gtaeta(:,ceil(end/4)).*cos(gfi(:,ceil(end/4)))+1;
  ty = 180/pi*gtaeta(:,ceil(end/4)).*sin(gfi(:,ceil(end/4)))+1;
  txtstr = num2str(ze(:,ceil(end/4)));
  I = find(ty>ax(3));
  tx = tx(I);
  ty = ty(I);
  txtstr = txtstr(I,:);
  I = find(ty<ax(4));
  tx = tx(I);
  ty = ty(I);
  txtstr = txtstr(I,:);
  I = find(tx>ax(1));
  tx = tx(I);
  ty = ty(I);
  txtstr = txtstr(I,:);
  I = find(tx<ax(2));
  tx = tx(I);
  ty = ty(I);
  txtstr = txtstr(I,:);
  text(tx(3:end),ty(3:end),txtstr(3:end,:),'color',c,'fontweight','bold')
  if max(size(tx)>1)
    text(tx(2),ty(2),num2str(az(2,ceil(end/4))),'color',c,'fontweight','bold')
  end
  
  tx = 180/pi*gtaeta(:,ceil(end/2)).*cos(gfi(:,ceil(end/2)))+1;
  ty = 180/pi*gtaeta(:,ceil(end/2)).*sin(gfi(:,ceil(end/2)))+1;
  txtstr = num2str(ze(:,ceil(end/2)));
  I = find(ty>ax(3));
  tx = tx(I);
  ty = ty(I);
  txtstr = txtstr(I,:);
  I = find(ty<ax(4));
  tx = tx(I);
  ty = ty(I);
  txtstr = txtstr(I,:);
  I = find(tx>ax(1));
  tx = tx(I);
  ty = ty(I);
  txtstr = txtstr(I,:);
  I = find(tx<ax(2));
  tx = tx(I);
  ty = ty(I);
  txtstr = txtstr(I,:);
  text(tx(3:end),ty(3:end),txtstr(3:end,:),'color',c,'fontweight','bold')
  if max(size(tx)>1)
    text(tx(2),ty(2),num2str(az(2,ceil(1))),'color',c,'fontweight','bold')
  end

  tx = 180/pi*gtaeta(:,ceil(1)).*cos(gfi(:,ceil(1)))+1;
  ty = 180/pi*gtaeta(:,ceil(1)).*sin(gfi(:,ceil(1)))+1;
  txtstr = num2str(ze(:,ceil(1)));
  I = find(ty>ax(3));
  tx = tx(I);
  ty = ty(I);
  txtstr = txtstr(I,:);
  I = find(ty<ax(4));
  tx = tx(I);
  ty = ty(I);
  txtstr = txtstr(I,:);
  I = find(tx>ax(1));
  tx = tx(I);
  ty = ty(I);
  txtstr = txtstr(I,:);
  I = find(tx<ax(2));
  tx = tx(I);
  ty = ty(I);
  txtstr = txtstr(I,:);
  
  text(tx(3:end),ty(3:end),txtstr(3:end,:),'color',c,'fontweight','bold')
  if max(size(tx)>1)
    text(tx(2),ty(2),num2str(az(2,19)),'color',c,'fontweight','bold')
  end
  
end

if ( unhold )
    
  hold off
  
end
ok = 1;
