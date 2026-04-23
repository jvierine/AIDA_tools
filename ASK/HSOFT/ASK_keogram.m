function [keo,time_V] = ASK_keogram(cam,fir,las,ste,width,x0,y0,angle,bkg,OPS)
% ASK_KEOGRAMS - Produce keograms keograms from an ASK image sequence
%
% CALLING:
%   [keo1,keo2,keo3,time_V] = ASK_keograms(cam,fir,las,ste,width,x0,y0,angle,bkg,dist)
% INPUTS:
%   cam      - ASK camera number, scalar int {1, 2, 3}
%   fir      - first image number, scalar int 
%   las      - last image number, scalar int 
%   ste      - frame step, scalar int 
%   shift    - shift of images with respect to each other ([0,0,0] if there is no shift), 
%   width    - width of the column that is used for creating the keogram, 
%   x0, y0   - central pixles of the keogram cut, 
%   angle    - angle of the cut, where 0 is a horizontal cut and 90
%              vertical. 
%   name     - the name of the resulting ps-file 
%
% Optional arguments:
%   bkg      - background to remove from [ASK1,ASK2,ASK3]
%   dist     - Puts distance on the y-axis in km (set up for ASK data)
%
% The nicest keograms are created from appr. 1000 frames.
% WARNING: If data is not calibrated this routine will crash!
% First of all the ASK meta-data has to be read in with read_vs!
% If the data is 512x512 pixels, the images will first be binned to
% 256x256 pixels
%

% Modified from add_multi.pro
% Copyright Bjorn Gustavsson 20110131
% GPL 3.0 or later applies

global vs

dOPS = ASK_read_v;
dOPS.loud = 0;
if nargin == 0
  keo = dOPS;
  return
elseif nargin > 9 && ~isempty(OPS)
  dOPS = merge_structs(dOPS,OPS);
end

if nargin < 8 || isempty(bkg)
  bkg = [0,0,0];
end
wbh = waitbar(0,'making keogram');

nelem = (las - fir)/ste + 1;

time_V = zeros(nelem,6);
keo = zeros(256,nelem);

i1 = 1; % was l???
ASK_v_select(cam,'quiet'); % Set current camera to the selected one

for num = fir:ste:las
  if dOPS.loud
    disp(num)
  end
  % Read the current images
  time_V(i1,:) = ASK_indx2datevec(num);
  im1 = ASK_read_v(num,[],[],[],dOPS);   % Read the ASK#1 image

  % If required do post-binning to 256 x 256
  if all([vs.dimx(vs.vsel) vs.dimy(vs.vsel)] == [512 512])
    im1 = ASK_binning(im1,[2,2]);
  end
  
  % Rotate images:
  im_1 = img_rot(im1,-(angle-90),x0,y0,'*spline',0);
  % Display current image
  if dOPS.loud
    imagesc(im_3),
    axis xy
    drawnow
  end
  % Extract intensity cut for building the keograms:
  lin1 = mean(im_1(:,127-width/2:127-width/2+width-1),2);
  % Stuff the line-intensities into the keograms:
  keo(:,i1) = lin1 - bkg(1);
  
  i1 = i1+1;
  if mod(i1,20) == 0
    try
      waitbar(min(1,(num-fir)/(las-fir)),wbh);
    catch
      % whatever
    end
  end
end
calib = ASK_get_ask_cal(vs.vmjs(vs.vsel),[1,2,3]);
keo = keo*calib(cam)/vs.vres(vs.vsel);
try
  close(wbh)
catch
  % whatever
end
