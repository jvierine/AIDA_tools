function img_out = add_some_stars(img_in,time,pos,optpar,add_these_stars,pars2use,OPS)
% ADD_SOME_STARS - add bright stars from the BSC to images,
%  The stars from the bright star catalog is added as gereralised 2-D
%  Gaussian to the image. Intended for simple modeling of starfield images.
%  ADD_SOME_STARS allow for simple variation of the point-spread-function
%  over the image (linear increase of the horizontal FWHM with vertical
%  image position away from the image centre, and linear increase of the
%  vertical FWHM with the horizontal image position away from the image
%  centre). However more severe astigmatism and coma would be challenging
%  to model. Inermediately peculiarly shaped PSFs, such as due to spherical
%  aberration would have to be modeled by combining multiple star-images
%  step-wise, utilizing the gamma-parameter for the generalized Gaussians. 
% 
% Calling:
%   img_out = add_some_stars(img_in,time,pos,optpar,add_these_stars,pars2use[,OPS])
%   OPS     = add_some_stars;
% Input:
%   IMG_IN   - image to model the starfield for, for size of output-image.
%   TIME     - Date and UT-time of observation [YYYY, MM, DD, hh, mm, ss.xx]
%   POS      - Latitude and longitudee of observations site (degrees)
%   OPTPAR   - Optical parameters that describe the optics and rotation
%              of the camera,
%   ADD_THESE_STARS - Star-catalog data of stars to add [RA, Decl, Magn].
%   PARS2USE - Parameters to use for star (2-D Gaussian), I_scaling, dx, dy
%              and optionally ddx(dx) and ddy(dy). I_scaling is the peak
%              intensity of the Gaussian for a magnitude-0 star. dx and dy
%              are the half-width-1-over-e widths. ddy(dx) and ddx(dy) are
%              the changes of the point-spread-function width with
%              image-distance from the image centre.
%   OPS      - Options-struct, optional input argument, default options
%              returned when function called without input arguments.
%              Options field are:
%              .dl - half-size of image-region for which the 2-D Gaussian is
%                    calculated default: 5 (image region:2*5+1), scalar int
%              .magn_limit - magnitude-limit, scalar double default 6.5 for
%                    cutting off the stars fainter than magn_limit
%              .first_Airy_zero - radius of the Airy-disk, double scalar
%                    (pixels), i.e. the distance from the centre to the
%                    first zero of the Airy-pattern, default is to not have
%                    a diffraction-pattern (all images I've looked at have
%                    had aberration-limited optical systems, I'm not bitter
%                    it is just the way it is)
%              .do_costheta - do correction of star intensity over the
%                    image, this corrects the image intensity with a factor
%                    cos(theta), where theta is the angle from the optical
%                    axis. This should not be done in such a simplistic
%                    manner for fish-eye lenses.
% Output:
%   IMG_OUT - image with bright stars.
%
% Example:
%  o_longlat   = [20.4201   67.8558];        % Camera-position
%  o_time    = [2004, 11, 21, 4, 49, 20];  % date-time
%  % Load the Bright Star Catalog
%  bsc_stars = loadstars3(longlat,o_time(1:3),o_time(4:6));
%  % Some optical parameters for the camera
%  optpar    = [-1.2205, 1.2208, -0.0917, 0.9310, 2.3877, 0.0611, 0.0481, 0.8313, 5];
%  % Brightness-scaling factor, widths of Gaussian in the centre and widenings
%  sIdxdy    = [1e4 0.5 0.5 1.5 1.5];
%  % Get the default options and modify them
%  OPS4addstars                 = add_some_stars;     
%  OPS4addstars.dl              = 7;               
%  OPS4addstars.first_Airy_zero = 3.2;
%  OPS4addstars.magn_limit      = 6.2;     
%  star_img  = add_some_stars(ones(1024),...
%                             o_time, ...
%                             o_longlat, ...
%                             optpar,...
%                             bsc_stars(:,[1 2 6]),...
%                             sIdxdy,...
%                             OPS4addstars);
%  imagesc(star_img),axis xy
%  imgs_smart_caxis(0.001,star_img)
%  colorbar
%  colormap(bone)

%   Copyright © 20251007 Bjorn Gustavsson, <bjorn.gustavsson@uit.no>
%   This is free software, licensed under GNU GPL version 2 or later


%% Default settings
dOPS.dl              = 5;   % half-size of the image region
dOPS.magn_limit      = 6.5; % magnitude-limit
dOPS.first_Airy_zero = [];  % radius of the first minima of the Airy-pattern [pixels]
dOPS.do_costheta     = 1;   % correct the star-brightness wrt angle to optical axis
if nargin == 0
  % then we return the default options
  img_out = dOPS;
  return
end
if nargin > 6 && isstruct(OPS)
  % Then we have user-supplied options-struct, and merge this over dOPS
  dOPS = merge_structs(dOPS,OPS);
end
% Extract the settings
dl         = dOPS.dl;         % 5;
magn_limit = dOPS.magn_limit; % 6.5;
lAi10 = dOPS.first_Airy_zero;
do_costheta = dOPS.do_costheta;

%% Cut out the fainter stars
add_these_stars(add_these_stars(:,3) > magn_limit,:) = [];

%% Get the parameters for the generalized Gaussian
Ihat = pars2use(1);
dx   = pars2use(2);
dy   = pars2use(3);
if numel(pars2use) > 3
  ddydx = pars2use(4);
  ddxdy = pars2use(5);
else
  ddydx = 0;
  ddxdy = 0;
end
if numel(pars2use) > 5
  gamma = pars2use(6);
else
  gamma = 2;
end

%% initialize image-region and output image
[X,Y] = meshgrid(-dl:dl);
img_out = 0*img_in;

%% model the star-image
if ~isempty(add_these_stars)
  % if there are any stars remaining
  sz_uv = size(img_out);
  sz_u = sz_uv(2);
  sz_v = sz_uv(1);
  % Calculate the sky positions of the stars to mask out:
  [az,ze] = starpos2(add_these_stars(:,1),...
                     add_these_stars(:,2),...
                     time(1:3),...
                     time(4:6),...
                     pos(2),...
                     pos(1));
  Magn = add_these_stars(:,3);
  % and their horizonal (uS) and vertical (vS) image positions:
  if isstruct(optpar)
    [uS,vS] = project_directions(az',ze',optpar,optpar.mod,sz_uv);
  else
    [uS,vS] = project_directions(az',ze',optpar,optpar(9),sz_uv);
  end
  uS = round(uS);
  vS = round(vS);
  % Keep the stars that are inside enough that the +/- dl region is fully
  % inside the image. Yeah, one could be more clever around the edges - pay me...
  iu = find(inimage(uS-dl,vS-dl,sz_u-(2*dl+1),sz_v-(2*dl+1)));
  uS = uS(iu);
  vS = vS(iu);
  Magn =Magn(iu);
  % Get to work, star by star
  for iS = 1:length(iu)
    cMagn = Magn(iS);
    Istar = Ihat*(100^(1/5))^-(cMagn-1);  % Brightness of current star
    u0_currStar = uS(iS)-floor(uS(iS));   % Hor pos in pixesl rel 0 in X
    v0_currStar = vS(iS)-floor(vS(iS));   % Vert pos in pixesl rel 0 in Y
    dx_currStar = dx + 2*ddydx*abs(vS(iS)-sz_v/2)/sz_v; % Horizontal width
    dy_currStar = dy + 2*ddxdy*abs(uS(iS)-sz_u/2)/sz_u; % Vertical width
    currPars = [u0_currStar, ... % uS(iS)-floor(uS(iS)),...
                v0_currStar, ... % vS(iS)-floor(vS(iS)),...
                Istar, ...       % Ihat*(100^(1/5))^-(cMagn-1),...
                dx_currStar, ... % dx + 2*ddydx*abs(vS(iS)-sz_v/2)/sz_v, ...
                0,...            % rotational angle of star-ellipsoid
                dy_currStar, ... % dy + 2*ddxdy*abs(uS(iS)-sz_u/2)/sz_u,...
                gamma];
    [starintens] = starint2G(currPars,X,Y);
    if isfinite(lAi10)
      % If someone have specified a width of the Airy-diffraction-disk, we
      % have to respect that, and combine this PSF with the Gaussian.
      I_airy = besselj(1,sqrt(X.^2+Y.^2)*3.8317/lAi10).^2./((X.^2+Y.^2)*(3.8317/lAi10)^2);
      I_airy((X.^2+Y.^2)==0) = 1/4;
      starintens = conv2(starintens,I_airy,'same');
    end
    img_out(Y(:,1)+floor(vS(iS)),X(1,:)+floor(uS(iS))) = img_out(Y(:,1)+floor(vS(iS)),X(1,:)+floor(uS(iS))) + starintens;
  end
  
end

%% Adjust image brightness due to apparent limiting apperture area variation
% The apparent area of the front-lens of a thin-lens goes as cos(theta)
% where theta is the angle to the optical axis.
if do_costheta
  [u,v] = meshgrid(1:sz_u,1:sz_v);
  [~,theta] = camera_invmodel(u,v,optpar,optpar(9),[sz_v sz_u]);
  img_out = img_out.*cos(theta);
end