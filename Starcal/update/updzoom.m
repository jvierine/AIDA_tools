function [SkMp,currStarHndl] = updzoom(SkMp)
% UPDZOOM - 
%   

%   Copyright © 2011 Bjorn Gustavsson, <bjorn.gustavsson@irf.se>
%   This is free software, licensed under GNU GPL version 2 or later

global bx by bxy

bxy = size(SkMp.img);
bx = bxy(1);
by = bxy(2);

dl = SkMp.prefs.sz_z_r;
ginp_clr = [1 0.5 0]; % Colour for cross-hair of ginputc
ginp_lw  = 1;         % linewidth for cross-hair of ginputc

figure(SkMp.figsky)

%[x0,y0,button] = ginput(1);
%[x0,y0] = ginput(1);
try
  [x0,y0] = ginputc(1,...
                    'color',ginp_clr,...
                    'linewidth',ginp_lw,...
                    'ShowPoints',false);
catch
  [x0,y0] = ginput(1);
end

x0 = floor(x0);
y0 = floor(y0);
hold on
currStarHndl = plot(x0,y0,'mh');
SkMp.currStarpoint = currStarHndl;

xmin = floor(min(max(x0-dl/2,1),by-dl));
xmax = floor(max(min(x0+dl/2,by),dl+1));
ymin = floor(min(max(y0-dl/2,1),bx-10));
ymax = floor(max(min(y0+dl/2,bx),dl+1));

figure(SkMp.figzoom)
imagesc(xmin:xmax,ymin:ymax,SkMp.img(ymin:ymax,xmin:xmax)),
axis xy
