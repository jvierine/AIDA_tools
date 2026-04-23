function [idstarsok,stars_par] = star_int_search_prime(img_in,optpar,optmodel,plstars,OPTS)
% [idstarsok,stars_par] = star_int_search(img_in,optpar,optmodel,plstars,OPTS)
% 
% STAR_INT_SEARCH identifies points in image with stars, make a parametrisation
%
% Input:
%   img_in   - Image.
%   optpar   - Optical parameters the describe the camera characteristics.
%   optmodel - Optical transfer function.
%   plstars  - Bright Star CAtalog stars that are above the horison
%   OPTS     - SPC_TYPICAL_OPS struct see that function
%   


%   Copyright © 1997 Bjorn Gustavsson, <bjorn.gustavsson@irf.se>
%   This is free software, licensed under GNU GPL version 2 or later

% global bx by


dl = 10;
if nargin > 4 && ~isempty(OPTS) && isfield(OPTS,'regsize')
  dl = OPTS.regsize;
end
dxy = 1.5;
if nargin > 4 && ~isempty(OPTS) && isfield(OPTS,'dxy')
  dxy = OPTS.dxy;
end
plotintermediates = 0;
if nargin > 4 && ~isempty(OPTS) && isfield(OPTS,'plotintermediates')
  plotintermediates = OPTS.plotintermediates;
end
pausetime = 0;
if nargin > 4 && ~isempty(OPTS) && isfield(OPTS,'pausetime')
  pausetime = OPTS.pausetime;
end


fms_opts = optimset('fminsearch');
fms_opts = optimset(fms_opts,'Display','off');

more off

bxy = size(img_in);
bx = bxy(2);
by = bxy(1);

% imax = max(size(plstars));
idnr = 0;

% Determine the coordinate system for the camera.
alpha0 = optpar(3);
beta0 = optpar(4);
gamma0 = optpar(5);
if length(optpar) > 9
  [e1,e2,e3] = camera_base(alpha0,beta0,gamma0,optpar(10));
else
  [e1,e2,e3] = camera_base(alpha0,beta0,gamma0);
end

identstars = zeros(size(plstars,1),11);
stars_par  = zeros(size(plstars,1),7);
%Determine the projected position of the star on the image
az = plstars(:,1);
ze = plstars(:,2);

[xAll,yAll] = camera_model(az,ze,e1,e2,e3,optpar,optmodel,bxy);

for iStar = 1:size(plstars,1)
  
  x0 = xAll(iStar);
  y0 = yAll(iStar);
  if ( ( 1 < x0 && x0 < bx ) && ( 1 < y0 && y0 < by ) )
    
    % Determine the part of the image confining the star.
    xmin = floor(min(max(x0-dl/2,1),bx-dl));
    xmax = floor(max(min(x0+dl/2,bx),(dl+1)));
    ymin = floor(min(max(y0-dl/2,1),by-dl));
    ymax = floor(max(min(y0+dl/2,by),(dl+1)));
    
    % Find the star in the region of interest.
    bg_mat = img_in(ymin:ymax,xmin:xmax);
    bg_mat = medfilt2(bg_mat([1 1:end end],[1 1:end end]),[3 3]);
    bg_mat = bg_mat(2:end-1,2:end-1);
    x = xmin:xmax;
    y = ymin:ymax;
    [x1,y1] = meshgrid(x,y);

    if ~isempty(OPTS) && isfield(OPTS,'bgtype') && strcmp(OPTS.bgtype,'complicated')
      
      b = [bg_mat(1,:),bg_mat(end,:),...
           bg_mat(:,1)',bg_mat(:,end)',...
           bg_mat(3,:),bg_mat(end-2,:),...
           bg_mat(:,3)',bg_mat(:,end-2)'];
      X = [x1(1,:),x1(end,:),...
           x1(:,1)',x1(:,end)',...
           x1(3,:),x1(end-2,:),...
           x1(:,3)',x1(:,end-2)'];
      Y = [y1(1,:),y1(end,:),...
           y1(:,1)',y1(:,end)',...
           y1(3,:),y1(end-2,:),...
           y1(:,3)',y1(:,end-2)'];
      %% TODO-NOORA: Test for removing some griddata-warnings
      % [XYu,idxU] = unique([X:(:),Y:(:)],'rows');
      % b = b(idxU);
      % X = XYu(:,1);
      % Y = Xyu(:,2);
      % back_gr2 = griddata(X,Y,b,x1,y1,'v4')*2/3+griddata(X,Y,b,x1,y1,'cubic')/3;
      back_gr2 = gridfit(X,Y,b,x1(1,:),y1(:,1));

    else
      
      b = [bg_mat(1,:),bg_mat(end,:),bg_mat(:,1)',bg_mat(:,end)'];
      X = [x1(1,:),x1(end,:),x1(:,1)',x1(:,end)'];
      Y = [y1(1,:),y1(end,:),y1(:,1)',y1(:,end)'];
      %% TODO-NOORA: Test for removing some griddata-warnings
      % [XYu,idxU] = unique([X:(:),Y:(:)],'rows');
      % b = b(idxU);
      % X = XYu(:,1);
      % Y = Xyu(:,2);
      % back_gr2 = griddata(X,Y,b,x1,y1,'cubic');
      back_gr2 = gridfit(X,Y,b,x1(1,:),y1(:,1));
      
    end
    
    starmat = img_in(ymin:ymax,xmin:xmax) - back_gr2;
    bg3 = mean([starmat(1,:) starmat(end,:) starmat(:,end).' starmat(:,1).']);
    
    [max_I,indxmax] = max(starmat(:));
    
    startvec = [x0,    y0, abs(max_I), 1^2, 0,  1^2];
    % Upper and lower bounds on parameters for the case of 
    % wanting constrained star-fitting. Mainly constraining the star-fit to
    % stay withing +/- dxy pixels from the star-catalog projected image
    % coordinate
    % TODO-NOORA: At some stage perhaps allow +/-1.5 to increase -
    % since we look a fair bit on the scatter of the identified
    % star-positions to get at cloud-thickness?
    LB       = [x0-dxy,y0-dxy,     0,  0,-inf,  0];
    UB       = [x0+dxy,y0+dxy,   inf,inf, inf,inf];
    
    [starpar,~,exitflag] = fminsearchbnd(@(fv) stardiff2(fv,...
                                                      x1,...
                                                      y1,...
                                                      starmat-bg3,...
                                                      x1(indxmax),...
                                                      y1(indxmax),...
                                                      max_I/3),...
                                      startvec,...
                                      LB,...
                                      UB,...
                                      fms_opts);
%     [starpar,~,exitflag] = fminsearch(@(fv) stardiff2(fv,...
%                                                       x1,...
%                                                       y1,...
%                                                       starmat-bg3,...
%                                                       x1(indxmax),...
%                                                       y1(indxmax),...
%                                                       max_I/3),...
%                                       startvec,fms_opts);
    if exitflag ~= 1
      starpar = fminsearch(@(fv) stardiff2(fv,...
                                           x1,...
                                           y1,...
                                           starmat-bg3,...
                                           x1(indxmax),...
                                           y1(indxmax),...
                                           max_I/3),...
                           starpar,fms_opts);
    end
    fynd = starint(starpar,xmin,xmax,ymin,ymax);
    
    star_intm = (starmat).*(fynd>.07*(max(max(fynd))));
    if plotintermediates
      
      clf
      subplot(2,2,1),imagesc(xmin:xmax,ymin:ymax,starmat),axis xy,colorbar
      cx = caxis;
      subplot(2,2,2),imagesc(xmin:xmax,ymin:ymax,back_gr2+bg3),axis xy,colorbar
      caxis(cx)
      subplot(2,2,3),imagesc(xmin:xmax,ymin:ymax,fynd),axis xy,colorbar
      hold on
      caxis(cx)
      plot(x1(indxmax),y1(indxmax),'wp')
      plot(x0,y0,'kh')
      plot(starpar(1),starpar(2),'w.','markersize',15)
      hold off
      subplot(2,2,4),imagesc(xmin:xmax,ymin:ymax,starmat-back_gr2-bg3-fynd),axis xy,colorbar
      caxis([-1 1]*mean(abs(cx)))      
      if isfield(OPTS,'pausetime') & OPTS.pausetime > 0
        pause(OPTS.pausetime)
      else
        disp('Push any key to continue (this will become annoying...)')
        pause
      end
      
    end
    
    if ( xmin < starpar(1) && starpar(1) < xmax && ymin < starpar(2) && starpar(2) < ymax )
      
      star_intt = sum(sum(star_intm));
      star_max = max(max(star_intm));
      idnr = idnr + 1;
      identstars(idnr,1) = iStar;       % index in current star-list
      identstars(idnr,2) = starpar(1); 	% starpos in image(x)
      identstars(idnr,3) = starpar(2); 	% starpos in image(y)
      identstars(idnr,4) = starpar(3);  % max of 2D-Gauss
      identstars(idnr,5) = star_max; 	% max count from star
      identstars(idnr,6) = star_intt; 	% total counts from star
      identstars(idnr,7) = sum(fynd(:));% total counts from star-fit
      identstars(idnr,8) = iStar;
      identstars(idnr,9) = plstars(iStar,3);% BSNR/HR star identifier
      identstars(idnr,10) = sum((fynd(:)-starmat(:)-back_gr2(:)).^2); %total error^2
      identstars(idnr,11) = plstars(iStar,4);  % Star magnitude
      identstars(idnr,12) = mean(back_gr2(:)); % Background intensity
      identstars(idnr,13:15) = starpar(4:6);   % dx, phi, dy of star
      identstars(idnr,16:17) = [x0,y0];        % star-chart-image position
      
      stars_par(idnr,:) = [starpar,plstars(iStar,3)];
      % And remove the image intensity from this star to avoid
      % getting close stars picking up its intensity
      img_in(ymin:ymax,xmin:xmax) = img_in(ymin:ymax,xmin:xmax) - fynd;
      
    end
    
  end
  
end

idstarsok = identstars(1:idnr,:);
stars_par = stars_par(1:idnr,:);
