%%
%¤ Run line-by-line /BG-20170811
% I use %¤ for explaining comments...
cd  /home/bgu001/AIDA_tools/
AIDA_startup  %¤ Put AIDA-tools on the matlab path

%%
cd ~/AIDA_tools/Example-data/ %¤Here's where I had the example event...
ls
% 2008030518411000B.fits	20120124193524r3-frame16.acc  Cuts_peaks_5577A_18h41m10s.png	It-ray.mat		     S03_2008030520220000S.acc	S07_2008030521420000K.acc
% 2008030518411000S.fits	620120124193524r1-frame1.acc  Excitation-profiles-20120124.mat	MSISE_00_day64_F70_Ap15.dat  S04_2008030521420000T.acc	tomo_ops.mat
% 2008030518411000T.fits	620120124193524r1-frame3.acc  ImS2.mat				S010_2008030519200000B.acc   S05_2008030521420000A.acc
% 
% data_dir = pwd;
data_dir = pwd
%% 
% data_dir =
% 
% /home/bgu001/AIDA_tools/Example-data
% %¤ Just create some standard pre-processing options for image-loading
PO = typical_pre_proc_ops;
PO.find_optpar = 0;   % Dont look for optpar in the data base
PO.fix_missalign = 0; % ...and dont whine about it either
PO.central_station = 10;
POs(1:7) = PO;        % replicate this for all stations
%%
i1 = 1;
silkim  = load('S03_2008030520220000S.acc'); % *S*ilkimuotka %¤
                                             % with optical parameters
abisko  = load('S05_2008030521420000A.acc'); % *A*bisko
skibotn = load('S010_2008030519200000B.acc');% Ski*B*otn
tjaut   = load('S04_2008030521420000T.acc'); % *T*jautjas
  
ls *.acc
% 20120124193524r3-frame16.acc  620120124193524r1-frame3.acc  S03_2008030520220000S.acc  S05_2008030521420000A.acc
% 620120124193524r1-frame1.acc  S010_2008030519200000B.acc    S04_2008030521420000T.acc  S07_2008030521420000K.acc
% 
ls -1 *.acc
% 20120124193524r3-frame16.acc
% 620120124193524r1-frame1.acc
% 620120124193524r1-frame3.acc
% S010_2008030519200000B.acc
% S03_2008030520220000S.acc
% S04_2008030521420000T.acc
% S05_2008030521420000A.acc
% S07_2008030521420000K.acc
% 
optpB = skibotn([7:14 6 end]);
optpA = abisko([7:14 6 end]);
optpT = tjaut([7:14 6 end]);
optpS = silkim([7:14 6 end]);
%%
ls *.fits
% 2008030518411000B.fits	2008030518411000S.fits	2008030518411000T.fits
%¤ Fits-files for the example event
dFiles = {'2008030518411000B.fits','2008030518411000S.fits','2008030518411000T.fits'};
strcmp('2008030518411000B.fits',dFiles{1})
% 
% ans =
% 
%      1
% 
strcmp('2008030518411000S.fits',dFiles{1})
% 
% ans =
% 
%      0
% 
strcmp('2008030518411000S.fits',dFiles{2})
% 
% ans =
% 
%      1
% 
strcmp('2008030518411000T.fits',dFiles{3})
% 
% ans =
% 
%      1
% 
% 
POs(1).optpar = optpB; % Ski*B*otn
POs(2).optpar = optpA; % *A*bisko
POs(3).optpar = optpS; % *S*ilkimuotka
                       %POs(4).optpar = optpK;                        % KIRUNA NOT TO INCLUDE
POs(6).optpar = optpT; % *T*jautjas
%%
ii = 1; 
file_list = char(dFiles{1}(ii,:),dFiles{2}(ii,:),dFiles{3}(ii,:));
stns = tomo_inp_images(file_list,[],POs([1 3 6]));
%r_B = stns(1).obs.pos; % OLD VERSION
r_B = stns(1).obs.xyz;
%%
for iS = 3:-1:1
  [xx{iS},yy{iS},zz{iS}] = inv_project_img(stns(iS).img,...
                                           stns(iS).obs.xyz,...
                                           stns(iS).optpar(9),...
                                           stns(iS).optpar,...
                                           [0 0 1],...
                                           110,...
                                           stns(iS).obs.trmtr);
  subplot(2,2,iS)
  pcolor(xx{iS},yy{iS},stns(iS).img),shading flat
  axis([-100 100 -100 100])
end
%%
%¤ Here we start setting the 3-D block-of-blobbs
Vem = zeros([100 100 74]);% dRes = 2;Vem = zeros([100 100 74]*dRes);
% set the lower south-west corner:
ds = 2.5; % resolution of 2.5 km   ds = 2.5/dRes;
r0 = [-128 -64 80];
r0 = r_B + [-64*ds -64*ds 80]+[10 0 0];
% Define the lattice unit vectors
dr1 = [ds 0 0];
dr2 = [0 ds 0];
% With e3 || vertical:
dr3 = [0 0 ds];
% or || magnetic zenith:
dr3 = [0 -ds*tan(pi*12/180) ds];
%% 3.2 Calculate duplicate arrays for the position of the base functions:
[r,X,Y,Z] = sc_positioning(r0,dr1,dr2,dr3,Vem);
XfI = r0(1)+dr1(1)*(X-1)+dr2(1)*(Y-1)+dr3(1)*(Z-1); % XfI(:,43,:) at EISCAT     , 2.5 km resol
YfI = r0(2)+dr1(2)*(X-1)+dr2(2)*(Y-1)+dr3(2)*(Z-1); % YfI(70,:,10) at 100 km alt, 2.5 km resol
ZfI = r0(3)+dr1(3)*(X-1)+dr2(3)*(Y-1)+dr3(3)*(Z-1); % ZfI(1,1,10) 100 km height , 2.5 km resol
nr_layers = 17;
length(stns)
%
% ans =
%
%     3
%
%%
%¤ Set-up the camera structure for fast image projections
for i1 = 1:length(stns)
  
  rstn = stns(i1).obs.xyz;  %
%  rstn = stns(i1).obs.pos;   % OLD VERSION % Position of station i1
  optpar = stns(i1).optpar;  % Optical parameters of station i1
  imgsize = size(stns(i1).img);  % Image size of station i1
  cmtr = stns(i1).obs.trmtr;
%  cmtr = stns(i1).obs.cmtr; % OLD VERSION % Correction matrix of station i1
  [stns(i1).uv,stns(i1).d,stns(i1).l_cl,stns(i1).bfk,DS(i1),stns(i1).sz3d] = camera_set_up_sc(r,...
                                                    X,...
                                                    Y,...
                                                    Z,...
                                                    optpar,...
                                                    rstn,...
                                                    imgsize,...
                                                    nr_layers,...
                                                    cmtr);
  
end
%%
stns.sz3d
% 
% ans =
% 
%    100   100    74
DS
% 
% DS =
% 
%      1     1     1
% 
for i1 = 1:length(stns)
  %stns(i1).r = stns(i1).obs.pos;
  stns(i1).r = stns(i1).obs.xyz; % MY NEW VERSION
end
%¤ What it says on the line below!
%% 4.3 Test of fast projection
% To make sure we have gotten it all right this far we calculate the
% image of a flat 3-D distribution for all cameras
for i1 = 1:length(stns)
  stns(i1).proj = fastprojection(ones(size(X)),...
                                 stns(i1).uv,...
                                 stns(i1).d,...
                                 stns(i1).l_cl,...
                                 stns(i1).bfk,...
                                 [256 256],1,stns(i1).sz3d);
  subplot(2,2,i1)
  imagesc(stns(i1).img)
  cX{i1} = caxis;
  hold on
  contour(stns(i1).proj,8,'k')
  caxis(cX{i1})
end
%%
% tomo_ops = make_tomo_ops(stns);
% Currently these iterative methods are implemented
% 1. Multiplicative ART
% 2. Multiplicative SIRT
% 3. SIRT
% 4. FMAPE
% --------
% Which kind of iteration method should we use?  {1}: 2
% Typically it is good to set the update-ratio to 1 on the 
% borders of images. Unless there is special reasons not to
% this is adviseable.
% Are there any images that should not have quiet borders? {0}: 
% To avoid/reduce problems with errors in intensity calibrations
% one trick to use is to normalize the intensity of the projections
% to the image intensity in a central region. This way the spatial
% intensity variation will be utilized, but not the absolute intensity itself.
% Are there any images that should be intensity normalized? (vector notation, ex: [2,3,4]) {0}: [2 3]
% Type of spatial filtering to stabilize the reconstruction
% Available are:
% 0. None
% 1. Horizontal local averaging, filter2.
% 2. Horizontal median filter, medfilt2.
% 3. Proximity constraint, proxfilt.
% Which filter type to use? {0}: 1
% What filter kernel to use [matlab matrix]? {1}: [1 1 1;1 1 1;1 1 1]/9
% tomo_ops
% 
% tomo_ops = 

% 1x3 struct array with fields:
% 
%     tomotype
%     randorder
%     qb
%     renorm
%     filtertype
%     filterkernel
%     alpha
%     disp
% 

%¤ Setting the options for tomographic inversioning
%¤ Select ART first below, then SIRT will be created afterwards
tomo_ops = make_tomo_ops(stns);
%%
%  Currently these iterative methods are implemented
% 1. Multiplicative ART
% 2. Multiplicative SIRT
% 3. SIRT
% 4. FMAPE
% --------
% Which kind of iteration method should we use?  {1}: 
% For ART it might be of importance in which order the stations
% are used. Therefore there are 3 possible groups, first (1),
% middle(2) or last (3)
% Group the stations into classes? (vector notation, ex: [2 2 1 3]) {2}: [2 2 2]
% Typically it is good to set the update-ratio to 1 on the 
% borders of images. Unless there is special reasons not to
% this is adviseable.
% Are there any images that should not have quiet borders? {0}: 
% To avoid/reduce problems with errors in intensity calibrations
% one trick to use is to normalize the intensity of the projections
% to the image intensity in a central region. This way the spatial
% intensity variation will be utilized, but not the absolute intensity itself.
% Are there any images that should be intensity normalized? (vector notation, ex: [2,3,4]) {0}: [2 3]
% Type of spatial filtering to stabilize the reconstruction
% Available are:
% 0. None
% 1. Horizontal local averaging, filter2.
% 2. Horizontal median filter, medfilt2.
% 3. Proximity constraint, proxfilt.
% Which filter type to use? {0}: 1
% What filter kernel to use [matlab matrix]? {1}: [1 1 1;1 1 1;1 1 1]/9
tomo_ops
% 
% tomo_ops = 
% 
% 1x3 struct array with fields:
% 
%     tomotype
%     randorder
%     qb
%     renorm
%     filtertype
%     filterkernel
%     alpha
%     disp
% 
tomo_opssirt = tomo_ops;
%tomo_opssirt.tomo_type = 2; % BUG
%for i=1:length(tomo_opssirt)
i=1;
tomo_opssirt(i).tomotype = 2;
%end
tomo_artops = tomo_ops(1);
try
  tomo_ops34 = tomo_ops(3:4);
catch
  tomo_ops34 = tomo_ops(2:3);
end
Energy =linspace(50.^.5,20000.^.5,100).^2;
[POs(1).ffc] = ffs_correction2(imgsize,POs(1).optpar,3);
[POs(2).ffc] = ffs_correction2(imgsize,POs(2).optpar,3);
[POs(3).ffc] = ffs_correction2(imgsize,POs(3).optpar,3);
[POs(6).ffc] = ffs_correction2(imgsize,POs(6).optpar,3);
clf
imagesc(POs(1).ffc)
imagesc(POs(2).ffc)
imagesc(POs(3).ffc)
imagesc(POs(4).ffc)
imagesc(POs(6).ffc)
i_z = [10 12 14 16 18 20 22 24 26]; % 100 105 110 115 120 125 130 135 140 km
i_x = [39:2:45,61];%38 43 61];    % "good", 43 <-> EISCAT, 61 <-> Skibotn
i_y = [70];       % EISCAT
[alts,widths] = meshgrid([100,105,110,115,120,125,130,135],[10,15]);

stns(1).obs.optpar = stns(1).optpar;
stns(2).obs.optpar = stns(2).optpar;
stns(3).obs.optpar = stns(3).optpar;
OPS4red2D = tomo_setup4reduced2D;
OPS4red2D.PlotStuff = 1;  % plots activated or not
OPS4red2D.ds = 1;
OPS4red2D.zmax = 115;
[M2Dto1D_12,U12,V12,X12,Y12,Z12] = tomo_setup4reduced2D(stns(1:2),OPS4red2D);

% uB =
% 
%   124.0984
% 
% 
% vB =
% 
%   106.4686
% 
% 
% r001 =
% 
%   -93.4759  225.8748   80.0000
% 
% 
% r002 =
% 
%    68.7560 -203.4090   80.0000
% 
% 
% 
[M2Dto1D_13,U13,V13,X13,Y13,Z13] = tomo_setup4reduced2D(stns([1,3]),OPS4red2D);
% 
% uB =
% 
%   124.0984
% 
% 
% vB =
% 
%   106.4686
% 
% 
% r001 =
% 
%   -20.1208  227.8525   80.0000
% 
% 
% r002 =
% 
%    11.9878 -201.6374   80.0000
% 
z2D = squeeze(Z12(1,1,:)); % This is the altitude grid we need to
f107a = MSISpars_f107af107pap(1);
f107p = MSISpars_f107af107pap(2);
ap = MSISpars_f107af107pap(3);
load MSISE_00_day64_F70_Ap15.dat
h_msis = MSISE_00_day64_F70_Ap15(:,1);
nHe = interp1(h_msis,MSISE_00_day64_F70_Ap15(:,6)*1e6,z2D,'linear','extrap');
nO =  interp1(h_msis,MSISE_00_day64_F70_Ap15(:,7)*1e6,z2D,'linear','extrap');
nN2 = interp1(h_msis,MSISE_00_day64_F70_Ap15(:,8)*1e6,z2D,'linear','extrap');
nO2 = interp1(h_msis,MSISE_00_day64_F70_Ap15(:,9)*1e6,z2D,'linear','extrap');
nAr = interp1(h_msis,MSISE_00_day64_F70_Ap15(:,10)*1e6,z2D,'linear','extrap');
nH =  interp1(h_msis,MSISE_00_day64_F70_Ap15(:,11)*1e6,z2D,'linear','extrap');
nN =  interp1(h_msis,MSISE_00_day64_F70_Ap15(:,12)*1e6,z2D,'linear','extrap');
Mass = interp1(h_msis,MSISE_00_day64_F70_Ap15(:,14)*1e3,z2D,'linear','extrap');
Tex =  interp1(h_msis,MSISE_00_day64_F70_Ap15(:,15),z2D,'linear','extrap');
Tn  = interp1(h_msis,MSISE_00_day64_F70_Ap15(:,16),z2D,'linear','extrap');
semilogx([nN2,nO2,nO,Mass],z2D)
clf
semilogx([nN2,nO2,nO,Mass],z2D)
Am = ionization_profile_matrix(z2D,Energy,nO,nN2,nO2,Mass);
% Using "ionization_profile_matrix" from:
% > In ionization_profile_matrix at 44
% consider changing to your own prefered function for calculating
% the monoenergetic-production profile matrix.
% 
% 
Ie2H5577 = Am;
Ie2H4278 = Am;
Ie2H = {Ie2H5577,Ie2H5577}; % This one will be used by the
OPS4tarc = tomo_arcpeakfinderinslice
% 
% OPS4tarc = 
% 
%            iplot: 1
%             ipng: 0
%       analys_dir: '/home/bgu001/AIDA_tools/Example-data'
%     filterKernel: [0.0500 0.1500 0.2000 0.2000 0.2000 0.1500 0.0500]
%          histlim: 0.6500
% 
OPS4tarc.ipng = 1;
OPS4tarc.zmax = 118;
clf
[I_cuts,iPeaks] = tomo_arcpeakfinderinslice(stns([1,2]),U12,V12,OPS4tarc);
[Vem,I2D] = tomo_start_guessGACT(stns(1:2),Energy,Ie2H,X12,Y12,Z12,M2Dto1D_12,U12,V12,I_cuts,iPeaks,XfI,YfI,ZfI,OPS4tarc);
%  
% Exiting: Maximum number of function evaluations has been exceeded
%          - increase MaxFunEvals option.
%          Current function value: 390950957.332549 
% 
%  
% Exiting: Maximum number of function evaluations has been exceeded
%          - increase MaxFunEvals option.
%          Current function value: 286473551.757012 
% 
%  
% Exiting: Maximum number of function evaluations has been exceeded
%          - increase MaxFunEvals option.
%          Current function value: 267608538.862873 
% 
%  
% Exiting: Maximum number of function evaluations has been exceeded
%          - increase MaxFunEvals option.
%          Current function value: 266499571.021040 
% 
% 
close
[Vem,I2D] = tomo_start_guessGACT(stns(1:2),Energy,Ie2H,X12,Y12,Z12,M2Dto1D_12,U12,V12,I_cuts,iPeaks,XfI,YfI,ZfI,OPS4tarc);
%  
% Exiting: Maximum number of function evaluations has been exceeded
%          - increase MaxFunEvals option.
%          Current function value: 390950957.332549 
% 
%  
% Exiting: Maximum number of function evaluations has been exceeded
%          - increase MaxFunEvals option.
%          Current function value: 286473551.757012 
% 
%  
% Exiting: Maximum number of function evaluations has been exceeded
%          - increase MaxFunEvals option.
%          Current function value: 267608538.862873 
% 
%  
% Exiting: Maximum number of function evaluations has been exceeded
%          - increase MaxFunEvals option.
%          Current function value: 266499571.021040 
% 
dFiles
% 
% dFiles = 
% 
%     '2008030518411000B.fits'    '2008030518411000S.fits'    '2008030518411000T.fits'
% 
tomo_slice_i(XfI,YfI,ZfI,Vem,32,65,12),shading flat

view(0,0)
view(180,0)
view(180,90)
view(180,0)
view(90,0)
view(-90,0)
StartGuess.Vem = Vem; % Keep the start guess aside -%%## add indices to this one...
% 5.5.3 Set the number of iterative loops
nr_laps = 1;    % Number of iterations (over all stations)
fS = [7 5 3 3]; % Filter-kernel size

% 5.5.4 Calculate filter kernel
i_f = 1;
[xf,yf] = meshgrid(1:fS(i_f),1:fS(i_f));
fK = exp(-(xf-mean(xf(:))).^2/mean(xf(:)).^2-(yf-mean(yf(:))).^2/mean(yf(:))^2);
tomo_ops(1).filterkernel = fK;
tomo_opssirt(1).disp = 'disp';
% wsp
% {Undefined function or variable 'wsp'.
% } 
for i_f = 2:length(fS)
  [xf,yf] = meshgrid(1:fS(i_f),1:fS(i_f));
  fK = exp(-(xf-mean(xf(:))).^2/mean(xf(:)).^2-(yf-mean(yf(:))).^2/mean(yf(:))^2);
  tomo_opssirt(1).filterkernel = fK;
  [Vem,stns] = tomo_steps(Vem,...
                          stns,...
                          tomo_opssirt,2);
   
end
figure
tomo_slice_i(XfI,YfI,ZfI,Vem,32,65,12),shading flat
caxis auto
% caxis'
% 
% ans =
% 
%    1.0e+04 *
% 
%    -0.2444
%     1.9062
% 
caxis
% 
% ans =
% 
%    1.0e+04 *
% 
%    -0.2444    1.9062
% 
% caxis
% 
% ans =
% 
%    1.0e+05 *
% 
%     0.0000    1.0439
% 
caxis([-0.2444    1.9062]*1e4)
caxis([-0.2444    1.9062]*3e4)
% quit
