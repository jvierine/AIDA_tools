function [u,v] = project_B_at_alt_los2img(img_in,u0,v0,optmod,optpar,lat0,long0,alt0,altB,z_range,t_img,options)
% INV_PROJ_IMG_LATLONG - calculate pixel-by-pixel Long-Lat coordinate for IMG_IN 
%   at altitude ALT. The image IMG_IN taken from LAT0, LONG0 at
%   an altitude ALT0 with a camera model OPTMOD and rotation and
%   optical transfer function caracterised by OPTPAR.
% 
% Callling:
%  [Long,Lat,dh_final] = inv_proj_img_latlong(IMG_IN,OPTMOD,OPTPAR,LAT0,LONG0,ALT0,ALT,ZE_MAX,options)
%
% Input:
%  
%  IMG_IN - Input image (double) grayscale or rgb
%  OPTMOD - is the optical model/transfer function to use:
%           1 - f*tan(theta),
%           2 - f*sin(alfa*theta),
%           3 - f(alfa*theta + (1-alfa)*tan(theta))
%           4 - f*theta 5 - f*tan(alfa*theta)
%           5 - f*tan(alfa*theta)
%          -1 - non-parametric, unrotated from zenith, with look-up
%               tables,
%          -2 - non-parametric, rotated from zenith, with look-up
%               tables,
%  OPTPAR - is a vector caracterising the optical
%           transfer function, or an OPTPAR struct, with fields:
%           sinzecosaz, sinzesinaz, u, v that define the horizontal
%           components of a pixel l-o-s, and the pixel coordinates
%           for the corresponding horizontal l-o-s components,
%           respectively, and optionally a field rot (when used a
%           vector with 3 Tait-Bryant rotaion angles)
%  LAT0   - Latitude of camera (degrees)
%  LONG0  - Longitude of camera (degrees)
%  ALT0   - altitude of camera (km)
%  ALT    - altitude (km) coordinates of grid points to project image to
%  ZE_MAX - maximum zenith angle to use, optional - defaults to 85 deg
%  options - options for controlling fminsearchbnd, the fields
%            TolFun and TolX defaults to 0.001 if no other options
%            are given, this to speed up the running time - 
%  
%  The excecution time gets a bit longish (~40 minutes on a Vaio
%  1.7 GHz lap-top for a 512x512 image with 163366 pixels above
%  ZE_MAX), this is tenable for one-time efforts where a lat-long
%  grid is calculated once per altitude per season for a camera,
%  for other uses INV_PROJECT_IMG or INV_PROJ_IMG_LL that does
%  similar projections is recommended (the first to a plane
%  horizontal in the local Cartesian coordinate system centred at
%  LONG0, LAT0; and the second calculates the image intensities for
%  points on a regular LONG-LAT grid)
% 
% Example: 
%   optpar =  [-2.3603, 1.5209, 11.506, 64.502, 0.086649,-0.0025577, -0.0044151, 1, 1, 0];
%   optmod = 1;
%   lat0 = 63.154355;
%   long0 = 17.234802;
%   alt0 = 0.254;
%   alt = 110;
%   
%   %  For a grayscale image this is enough:
%   img_in = double(rgb2gray(imread('nlc214.jpg')));
%   [Long,Lat,dh_final] = inv_proj_img_latlong(img_in,optmod,optpar,lat0,long0,alt0,alt,ze_max)
%   pcolor(Long,Lat,img_in),shading flat
% 
%       See also INV_PROJ_IMG_LL, INV_PROJECT_IMG, INV_PROJECT_IMG_SURF, CAMERA_MODEL, CAMERA_INV_MODEL

%   Copyright © 2020 Bjorn Gustavsson, <bjorn.gustavsson@irf.se>
%   This is free software, licensed under GNU GPL version 2 or later


%% 0.1 Set the maximum zenith angle if needed
ze_max = 88;

%% 0.2 Set options to fminsearchbnd
fmsops = optimset('fminsearch');
fmsops.TolFun = 0.001;
fmsops.TolX = 0.001;
if nargin > 11
  fmsops = merge_structs(fmsops,options);
end


%% 1 Calculate the line-of-sight vectors for requested pixel:
epix = inv_project_LineOfSightVectors(u0,v0,img_in,[0,0,0],optmod,optpar,[0 0 1],100,eye(3));



h_target = altB;
range0 = altB;
r0 = [0,0,0];

if acos(epix(3)) < ze_max*pi/180
  %% 2 Then start the work:

  %% Determine range along e_pix with altitude ALT
  %  Search for the range along e_pix where the line-of-sight
  %  reaches the local altitude corresponding to ALT
  [range,dh_final] = fminsearchbnd(@(l) alt_error(l,...
                                                  h_target,...
                                                  lat0,...
                                                  long0,...
                                                  alt0,...
                                                  r0,...
                                                  epix),...
                                   range0,...
                                   0,...
                                   1000*range0,...
                                   fmsops);
  
  %% Calculate the corresponding longitude-latitude
  [Lat0_B,Long0_B,alt0_B] = range2LongLatAlt(range,h_target,lat0,long0,alt0,r0,epix);
  alt0_B = alt0_B/1e3;
  %% Calculate the magnetic field at that point
  %  this to get us an inclination so that we can scale the length
  %  along B to get us up and down to the highest and lowest
  %  requested points in z_range
  [Bx, By, Bz] = igrf(datenum(t_img(1:3)),Long0_B,Lat0_B,alt0_B);
  zeB = atan(hypot(Bx, By)./Bz);
  %% Trace the magnetic field-line 
  %  from the selected line-of-sight-altitude intersection point up
  %  to close to the highest z_range, in steps of close to 1 km in
  %  altitude
  [latBu, longBu, altBu] = igrfline(datenum(t_img(1:3)), ...
                                    Lat0_B, ...
                                    Long0_B, ...
                                    alt0_B, ...
                                    'geod', ...
                                    (alt0_B-z_range(end))/cos(zeB), ...
                                    round(abs(alt0_B-z_range(end))));
  % and then down to the other end of the altitude range
  [latBd, longBd, altBd] = igrfline(datenum(t_img(1:3)), ...
                                    Lat0_B, ...
                                    Long0_B, ...
                                    alt0_B, ...
                                    'geod', ...
                                    (alt0_B-z_range(1))/cos(zeB), ...
                                    round(abs(alt0_B-z_range(1))));
  % It seems likely that the central point will be duplicated, if
  % so remove it
  % longlatalt = unique([[longBu;longBd],[latBu;latBd],[altBu;altBd]],'rows');
  longlatalt = [[longBu;longBd],[latBu;latBd],[altBu;altBd]];
  % Calculate the horizontal (u) and vertical (v) image coordinates
  % of the field-line.
  [u,v] = project_llh2img(longlatalt,[long0,lat0,alt0],[optpar,optmod,0],size(img_in));
  
end

function [lat,long,alt] = range2LongLatAlt(range,h_target,lat0,long0,h0,r0,epix)

r = points_on_lines(r0,epix,range)';
[long,lat,alt] = xyz_2_llh(lat0,long0,h0,r);

function dh2 = alt_error(range,h_target,lat0,long0,h0,r0,epix)

r = points_on_lines(r0,epix,range)';
[long,lat,h] = xyz_2_llh(lat0,long0,h0,r);
dh2 = (h/1e3-h_target)^2;
