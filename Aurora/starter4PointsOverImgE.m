%% Example script: how to estimate electron energies in flaming rays

%% 0 Load parameters and images:
% 
% This file contains "out-of-date" excitation profiles for the
% given energy and altitude grid:
whos -file Excitation-profiles-20120124.mat 
load Excitation-profiles-20120124.mat
subplot(1,2,1)
pcolor(E,z_trans(2:end),log10(a_N26730)),shading flat
caxis([-10 0]+max(caxis))
subplot(1,2,2)
pcolor(E,z_trans(2:end),log10(a_O7774)),shading flat
caxis([-10 0]+max(caxis))
%%
% 
%% Load the short image sequence, together with the polygons
% bounding an isolated flaming ray. The polygons I made with GINPUT,
% simply clicking away points along something I judged to be
% outside the ray and uncontaminated by other rays.
whos -file ImS2.mat
load ImS2.mat

%% 1 Create one background mask that is the sum of the regions
%  covered by any polygon:
bgMask = inP{1};
for i1 = 2:length(ImStack)
  bgMask = bgMask + inP{i1};
end
%%
% Simply make the background mask extend out to the image edge:
bgMask(188:226,256) = 1;
bgMask = min(1,bgMask);
hold off
imagesc(bgMask)

%% 2 Calculate as good a back-ground as possible for each image in
%  6730 and 7774. The inpaint_nans function provides several fancy
%  inpainting (interpolating into areas from values on the
%  boundary, possibly taking into account gradients too):
for i1 = 1:size(ImStack{1},3)
  img4bg = wiener2(medfilt2(ImStack{1}(:,:,i1),[3,3]),[3,3]);
  img4bg(bgMask==1) = nan;                   
  imbg{1}(:,:,i1) = inpaint_nans(img4bg,4);
  img4bg = wiener2(medfilt2(ImStack{3}(:,:,i1),[3,3]),[3,3]);
  img4bg(bgMask==1) = nan;                   
  imbg{3}(:,:,i1) = inpaint_nans(img4bg,4);  
end
%%
%  Display the estimated background images
for i1 = 1:size(ImStack{1},3)
  subplot(2,2,1)
  imagesc(imbg{1}(:,:,i1)),
  cX1 = imgs_smart_caxis(0.003,imbg{1}(:,:,i1));
  colorbar
  subplot(2,2,2)
  imagesc(imbg{3}(:,:,i1)),
  cX = imgs_smart_caxis(0.003,imbg{3}(:,:,i1));
  colorbar
  subplot(2,2,3)
  imagesc(ImStack{1}(:,:,i1))
  subplot(2,2,4)
  imagesc(ImStack{3}(:,:,i1))
  title(sprintf('%d out of %d',i1,size(ImStack{1},3)))
  pause(1)
  clf
end
%% Set up the projection from 3-D to ASK images:
projection_setup0H
%% Set-up of conversion from electron flux to emissions:
setUpOfIe2H
clf
subplot(1,2,1)
pcolor(E,squeeze(ZfI(1,1,:)),log10(A1Z)),
shading flat
caxis([-10 0]+max(caxis))
colorbar_labeled('Ie''log')
xlabel('Energy (keV)')
ylabel('Altitude (km)')
subplot(1,2,2)
pcolor(E,squeeze(ZfI(1,1,:)),log10(A2Z)),
shading flat,
caxis([-10 0]+max(caxis)),
colorbar_labeled('Ie''log')
xlabel('Energy (keV)')
ylabel('Altitude (km)')

%% First run to scale input parameters:
%  First an array of initial parameters. Here the position is gotten from
%  manually projecting the images to ~115 km of altitude with
%  inv_project_img, then selecting a point close to the peak intensity of
%  the ray.
[Xmax,Ymax] = inv_project_img(ImStack{1}(:,:,12),[0 0 0],optpASK1(9),optpASK1,[0 0 1],113.2,eye(3));
pcolor(Xmax,Ymax,ImStack{1}(:,:,12)),shading flat          
%%
% That has a peak close to [ -6, -12.8], for the other parameters we just
% guess:
%           I0        x0            dx           y0          dy            g_x           E0           dE          g_E         g_E2         phiE     I1      E0      dE        g_E     g_E2
I0 = [      1      -6.0993          0.3      -12.828          0.3            2            3            3            2            1            0
            2            0          Inf            0          Inf            2           10            1            1            1            0];

I0b = I0';
I0b = I0b(:);
I0C = (I0(:,[1,2,4,3,6:end])/2 + I0(:,[1,2,4,5,6:end])/2)';

errOps.bias2cylindrical = 1e8;
fmsOPS = optimset('fminsearch');
fmsOPS.Display = 'final';
fmsOPS.MaxFunEvals = 500;

%            I0        x0     dx           y0      dy       g_x     E0      dE      g_E     g_E2  phiE   I1      E0      dE        g_E     g_E2                  
parTest = [ 4.7336,   -5.918, 0.31721, -13.253, 0.19745, 2.2325, .52487, 2.9215, 2.9828, 0.47734,    0,  0.927,  16.56,  0.044845, 1.8183, 1];
%% 
% These are the upper and lower bounds on the parameters we search for:
parMin = [ eps(1), -12.0518, ds*1/3,    -18.553, ds*1/3,  0.6325, 0.1248, 0.9215, 0.5828, 0.25,   -2*pi,  eps(1),  0.56,  0.044845, 0.5183, 0.25];
parMax = [ 473.36,  -0.0518, 2.1721,     -6.553, 3.9745,  4.2325,32.487, 29.215,  4.9828, 2.47734, 2*pi,  21.927, 16.56, 12.044845, 3.8183, 3.7833];
%%
% This is the indices into the full parameter array for the searched for
% parameters:
v_p =    [  1          2       3            4      5        6       7       8       9      10        11    12  18     19        20      21];
%% 
% First search is to get the scale of the fluxes into the right order of
% magniture, so search only for them:
vpI = [1 11];
parI = parTest([1 11]);
%%
% and start in the middle of it all, with time-slice 12:
i1 = 12;
Iq = ( wiener2(ImStack{1}(:,:,i1),[3,3]) - wiener2(imbg{1}(:,:,i1),[3,3]) ) * 1/C_filter6370;
stns(1).img = Iq;
Iq = ( wiener2(ImStack{3}(:,:,i1),[3,3]) - wiener2(imbg{3}(:,:,i1),[3,3]) ) * 1/C_filter7774;
stns(2).img = Iq;
parI = fminsearchbnd(@(I) err4FlamingRays(I,vpI,I0b,stns,{bgMask,bgMask},ZfI,XfI(:,:,115),YfI(:,:,115),{A1Z,A2Z},E,1,113,errOps),parI,[eps(1) eps(1)],[1e6 1e6],fmsOPS);
%%
% put those flux-scaling-factors into the start-guess:
parTest([1 11]) = parI;
errMask = bgMask;
errMask(:,250:end) = 0;


