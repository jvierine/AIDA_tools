%% Example script for star-calibration
% This script illustrates how to run a geometric camera calibration with
% the STARCAL function in AIDA_tools.

%% 1, set-up of AIDA_tools
% First step is to add AIDA_tool to the matlab search-path, i.e. add all
% the AIDA_tools sub-directories to the list of directories matlab searches
% for functions. This is done by changing the current/working directory of
% matlab to the AIDA_tools directory. For the case where AIDA_tools is
% installed in the home-directory on a Linux/Unix system these are the
% steps:
cd ~
cd AIDA_tools/
AIDA_startup

%% Get to the image data
% This is one way to get the data.
% 
% The Auroral Large Imaging System saves image data in fits-files (Flexible
% Image Transport System is a very flexible data-format developed by the
% astronomical research community). This is the example-image to look at: 
fName = '2004112104492000K.fits';

%% Pre-processing options
% AIDA_tools have an image-reading function that can do a lot of
% pre-processing steps (filtering, corrections and the like). The
% processing steps are controlled with a struct with fields for steps to
% take and settings. The default steps are obtained with the
% TYPICAL_PRE_PROC_OPS function, it have a couple of default settings for
% different camera-systems and image formats. Here we select the default
% setting for data from ALIS
PO_ALIS = typical_pre_proc_ops('alis');

%% Look at an arbitrary image

[dA,hA,oA] = inimg(fName,PO_ALIS);

clf
colormap(bone)
imagesc(dA)
colorbar
%% Meta-data
% To use the spatial information in the image it is necessary to know where
% and when the image is taken, and the lines-of-sight of the pixels. The
% time of exposure and the location of the camera are themost important
% meta-data. For scientific camera systems meta-data are typically
% collected with the data in one systematic way or another. AIDA_tools
% makes it possible to read out that type of meta-data automatically with
% INIMG. For the ALIS-data this is done automatically. The meta-data
% necessary are returned in the observations-struct, here: oA. It looks
% like this:
oA
%% The full fits-header
% The fits-format stores meta-data in a ascii-plain-text header, and it
% contains a lot more information:
hA
%% 
% Here we set the default colormap to BONE. This slightly blue-ish
% grayscale makes the image look "reasonably night-sky-ish" which aids the
% eye to recognize stars.
%% Adjusting the color-limits
% Typically images have intensity out-liers. Those might hide most of the
% interesting image contents. Therefore one might clip the intensity-limits
% using histogram-determined limits:
cx = imgs_smart_caxis(0.0005,dA(:));
disp(cx)
%% Manual adjusting the color-limits
% It is also straight-forward to set the image intensity-limits explicitly:
caxis([0 3000])

%% Default image filtering.
% For science-grade images where the data out from the detector corresponds
% to one count for each photon detected in a pixel one has to have
% judgement about how to handle noise, both detector-noise and
% photon-counting noise. The INIMG-function has a couple of fields for
% controlling this. The basic selection is between no filtering, 2-D
% median-filter and wiener2-filtering (Lee's sigma-filter). This is
% controlled with the Po.medianfilter field. It is possible to select a
% general-sized region by setting this field to a 2-element array
PO_ALIS.medianfilter = [3,5];
% But typically one would have a square region with equal size, then a
% scalar integer is sufficient:
PO_ALIS.medianfilter = 3;
[dA,~,oA] = inimg(fName,PO_ALIS);
subplot(2,2,3)
imagesc(dA)
colorbar
cx = imgs_smart_caxis(0.0005,dA(:));
% If one sets the region to a negative scalar INIMG instead selects the
% wiener2-filter:
PO_ALIS.medianfilter = 3;
[dA,~,oA] = inimg(fName,PO_ALIS);
subplot(2,2,2)
imagesc(dA)
colorbar
caxis(cx)
% If no default filtering is wanted one sets the field to an empty array:
PO_ALIS.medianfilter = 3;
[dA,~,oA] = inimg(fName,PO_ALIS);
subplot(2,2,1)
imagesc(dA)
colorbar
caxis(cx)

%%
% [dA,~,oA] = inimg(fullfile(dALIS(i1).folder,dALIS(i1).name),PO_ALIS); 
SkMp = starcal(fName,PO_ALIS);
caxis(cx)

%% From here:
% 
% # Identify stars. Done in steps:
%   * (in the starcal menu) Magnify a recognisable star.
%   * (in the zoom-figure) centre the star, then fit a 2-D Gaussian
%     (autopick or manpick) 
%   * (Main figure, starcal menu) identify which star in the star-catalog
%     this image-star corresponds to.
%   * Repeat until some 5-10 stars have been correctly done.
%   * make an initial fit of the optical parameters with: search optpar,
%     select the simplest camera model (f*tan(theta)). Possibly repeat this
%     step
%   * Then select-and-identify more stars till you have some 30-50 stars
%     reasonably evenly distributed over the image, modify the camera-mode
%     as you see fit.
% # Once you have a good fit (error-scatter reasonably close to +/- 1/2
%   pixel) then you've done the geometric calibration. Save the optical
%   parameters
% # Go through the camera-modes and compare how the error-scatter varies
%   and look at how the radial residual varies with radial distance in the
%   image (error-plots menu item "dr of r")