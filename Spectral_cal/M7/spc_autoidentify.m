function [idstarsok,stars_par] = spc_autoidentify(data,optpar,optmod,Stars_azze,OPTS,SkMp)
% AUTOIDENTIFY - automatically identify all the stars of PLSTARS
% that appear in the skyview pannel and 
% falls within the field of view of the image, as computed with the
% optical parameters OPTPAR and optical transfer function MODE. 
% Autoidentify does its job from the brightest star in the field 
% of view to the faintest. You have to accept/reject/change the 
% identification of the star in the image. DATA is the image in which we
% try to identify the stars. FIG4, FIG3, is handles to the figures
% in which the plotting is done.
%
% Calling:
% [idstarsok] = autoidentify(plstars,optpar,mode,data,fig4,fig3)

%   Copyright � 1997 Bjorn Gustavsson<bjorn.gustavsson@irf.se>
%   This is free software, licensed under GNU GPL version 2 or later

plstars = Stars_azze; % SkMp.plottstars;
% optpar = SkMp.optpar;
% optmod = optmod;
fig4 = SkMp.figzoom;
fig3 = SkMp.figsky;
dl = SkMp.prefs.sz_z_r;

figtmp = figure;
% ua = [];
% va = [];
more off
b = size(data);
bx = b(2);
by = b(1);
tdata = data-min(min(data));
tstr = '';
imax = max(size(plstars));
idnr = 0;

% Sort plstars in ascending order with respect to magnitude.
% That is in descending order with respect to intensity.
order = plstars(:,4);
[~,indx1] = sort(order);
sortisd1 = plstars(indx1,:);
plstars = sortisd1;
clear sortids1 order indx1

% Determine the coordinate system for the camera.
if optmod < 0
  
  az0 = optpar.rot(1);
  el0 = optpar.rot(2);
  roll = optpar.rot(3);
  [e1,e2,e3] = camera_base(az0,el0,roll);
  
else
  
  alpha0 = optpar(3);
  beta0 = optpar(4);
  gamma0 = optpar(5);
  if length(optpar) > 9
    [e1,e2,e3] = camera_base(alpha0,beta0,gamma0,optpar(10));
  else
    [e1,e2,e3] = camera_base(alpha0,beta0,gamma0);
  end
  
end
tmp_ph = [];
enough_already = 0;
iS = 0;
fmsOPS = optimset('fminsearch');
fmsOPS.Display = 'none';

while iS <imax && ~enough_already
  iS = iS+1;
  clear sortids1 order x1 indx1
  %Determine the projected position of the star on the image
  az = plstars(iS,1);
  ze = plstars(iS,2);
  
  [x0,y0] = camera_model(az,ze,e1,e2,e3,optpar,optmod,size(SkMp.img));
  
  if ( ( 1 < x0 && x0 < bx ) && ( 1 < y0 && y0 < by ) )
    figure(fig3)
    try
      delete(tmp_ph)
    catch
      % nothing
    end
    hold on
    %tmp_ph = plot(x0,y0,[SkMp.prefs.cl_st_pt,'h']);
    tmp_ph = plot(x0,y0,'gh','linewidth',2);
    hold off
    % Determine the part of the image confining the star.
    xmin = floor(min(max(x0-dl/2,1),bx-dl));
    xmax = floor(max(min(x0+dl/2,bx),(dl+1)));
    ymin = floor(min(max(y0-dl/2,1),by-dl));
    ymax = floor(max(min(y0+dl/2,by),(dl+1)));
    
    % Find the star in the region of interest.
    set(fig4,'pointer','watch')
    
    starmat = tdata(ymin:ymax,xmin:xmax);
    starmat = medfilt2(starmat([1 1:end end],[1 1:end end]),[3 3]);
    starmat = starmat(2:end-1,2:end-1);
    % x = xmin:xmax;
    % y = ymin:ymax;
    bakgr2 = median( [starmat(1,:) starmat(end,:)  starmat(:,end)' starmat(:,1)' ]);
    
    starmat = tdata(ymin:ymax,xmin:xmax);
    figure(fig4)
    hold off
    clf
    pcolor(xmin:xmax,ymin:ymax,starmat-bakgr2),shading('interp')
    axis(axis)
    set(gca,'climmode','manual')
    
    startvec = [x0,y0,tdata(round(y0),round(x0))-median(bakgr2(:)),1,0,1];
    % starpar = fminsearch(@(startvec) stardiff2(startvec,xmin,xmax,ymin,ymax,starmat-bakgr2,x0,y0),startvec);
    [xStar,yStar] = meshgrid(xmin:xmax,ymin:ymax);
    starpar = fminsearch(@(startvec) stardiff2(startvec,xStar,yStar,starmat-bakgr2,x0,y0),startvec,fmsOPS);
    
    fynd = starint(starpar,xmin,xmax,ymin,ymax);
    star_intm = (starmat-bakgr2).*(fynd>.07*(max(max(fynd))));
    
    set(fig4,'pointer','arrow')
    hold on
    plot(x0,y0,'ko')
    if ( max(max(starmat)) - min(min(starmat)) > .1 )
      contour(xmin:xmax,ymin:ymax,starmat,8,'w')
    end
    if ( max(max(fynd)) - min(min(fynd)) > .1 )
      contour(xmin:xmax,ymin:ymax,fynd,8,'m')
    end
    if ( exist('identstars','var') )
      plot(identstars(:,3),identstars(:,4),'g*')
    end
    title('Autoidentifymode')
    xlabel('accept(l) repeat(m) skip(r) ')
    hold off
    
    figure(SkMp.figsky)
    h1 = rectangle('Position', [xmin ymin xmax-xmin ymax-ymin], 'EdgeColor', SkMp.prefs.pl_cl_slwn,'linewidth',2);
    
    figure(figtmp)
    plot(starmat,'b')
    hold on
    plot(star_intm+bakgr2,'r')
    plot(fynd+bakgr2,'g')
    plot((bakgr2+bakgr2.^.5)*ones(size(fynd)),'c')
    plot((bakgr2-bakgr2.^.5)*ones(size(fynd)),'y')
    hold off
    title(tstr)
    drawnow
    
    figure(fig4)
    
    % Allow the user to accept/skip/modify the identification.
    [~,~,button] = ginput(1);
    if isempty(button)
      enough_already = 1;
    end
    % Accept
    if (( button == 1 || lower(char(button)) == 'l' ) && ...
	xmin < starpar(1) && starpar(1) < xmax && ymin < starpar(2) && starpar(2) < ymax )
      
      tdata(ymin:ymax,xmin:xmax) = tdata(ymin:ymax,xmin:xmax)-star_intm;
      star_intt = sum(sum(star_intm));
      star_max = max(max(star_intm));
      idnr = idnr + 1;
      identstars(idnr,1) = plstars(iS,1); %azimuth
      identstars(idnr,2) = plstars(iS,2); %zenith - elevation
      identstars(idnr,3) = starpar(1); 	%starpos in image(x)
      identstars(idnr,4) = starpar(2); 	%starpos in image(y)
      identstars(idnr,5) = star_max; 	%max count from star
      identstars(idnr,6) = star_intt; 	%total counts from star
      identstars(idnr,7) = 1; 		%good gaussian fit
      identstars(idnr,8) = 0; 		%wide circular gausian
      identstars(idnr,9) = plstars(iS,3); %star index
      identstars(idnr,10) = plstars(iS,4); %star magnitude
      stars_par(idnr,:) = starpar;
      clear starpar starmat fynd ;
      
      figure(fig3)
      hold on
      [ua,va] = project_directions(identstars(:,1)',identstars(:,2)',optpar,optmod,size(SkMp.img));
      hold on
      plot(ua,va,'.',...
	   'color',SkMp.prefs.cl_st_pt,...
	   'markersize',SkMp.prefs.sz_st_pt)
      
      % Skip
    elseif ( button == 3 || lower(char(button)) == 'r' )
      
      clear starpar starmat fynd ;
      
      % Modify
    else
      
      varv = 1;
      [xin,yin,button] = ginput(1);
      if isempty(button)
        enough_already = 1;
      end
      while ( button == 2 || lower(char(button)) == 'm' )
	
        x0 = xin;
        y0 = yin;
        % Determine the part of the image confining the star.
        xmin = floor(min(max(x0-dl/2,1),bx-dl));
        xmax = floor(max(min(x0+dl/2,bx),dl+1));
        ymin = floor(min(max(y0-dl/2,1),by-dl));
        ymax = floor(max(min(y0+dl/2,by),dl+1));
        try
          delete(h1);
        catch
          % Whatever if it was impossible to delete h1, then don't fuss about
          % it, OK
        end
        h1 = rectangle('Position', [xmin ymin xmax-xmin ymax-ymin], 'EdgeColor', SkMp.prefs.pl_cl_slwn);
        
        % Find the star in the region of interest.
        starmat = tdata(ymin:ymax,xmin:xmax);
        bakgr2 = median( [starmat(1,:) starmat(end,:)  starmat(:,end)' starmat(:,1)' ]);
        
        figure(fig4)
        hold off
        clf
        pcolor(xmin:xmax,ymin:ymax,starmat),shading('interp')
        axis(axis)
        set(gca,'climmode','manual')
        
        if ( varv < 3 )
          
          set(fig4,'pointer','watch')
          
          [xStar,yStar] = meshgrid(xmin:xmax,ymin:ymax);
          startvec = [x0,y0,tdata(round(y0),round(x0))-bakgr2,1,0,1];
          % starpar = fminsearch(@(startvec) stardiff (startvec,xStar,yStar,starmat),startvec,fmsOPS);
          starpar = fminsearch(@(startvec) stardiff2(startvec,xStar,yStar,starmat-bakgr2,x0,y0,0),startvec,fmsOPS);
          set(fig4,'pointer','arrow')
          
        elseif ( 2 < varv && varv < 6 )
	      
          starpar = [x0,y0,abs(tdata(round(y0),round(x0))-bakgr2),.25,0,.25];
	      
        else
          
          starpar = [x0,y0,abs(tdata(round(y0),round(x0))-bakgr2),.5,0,.5];
          
        end
        
        fynd = starint(starpar,xmin,xmax,ymin,ymax);
        star_intm = (starmat-bakgr2).*(fynd>.07*(max(max(fynd))));
        
        hold on
        if max(starmat(:)) - min(starmat(:)) > 0.1
          contour(xmin:xmax,ymin:ymax,starmat,8,'w')
	end
        if ( max(fynd(:)) - min(fynd(:)) > 0.1 )
          contour(xmin:xmax,ymin:ymax,fynd,8,'m')
        end
        if ( exist('identstars','var') )
          plot(identstars(:,3),identstars(:,4),'g*')
        end
        title('Autoidentifymode')
        xlabel('accept(l) repeat(m) skip(r)')
        hold off
        
        figure(figtmp)
        plot(starmat,'b')
        hold on
        plot(star_intm+bakgr2,'r')
        plot(fynd+bakgr2,'g')
        plot((bakgr2+bakgr2.^.5)*ones(size(fynd)),'c')
        plot((bakgr2-bakgr2.^.5)*ones(size(fynd)),'y')
        hold off
        title(tstr)
        drawnow
        figure(fig4)
        
        % Allow the user to accept/skip/modify the identification.
        [xin,yin,button] = ginput(1);
        if isempty(button)
          enough_already = 1;
        end
        varv = varv+1;

      end
      
      if ( ( button == 1 || lower(char(button)) == 'l' ) && ...
	       xmin < starpar(1) && starpar(1) < xmax && ...
           ymin < starpar(2) && starpar(2) < ymax )
	    
        tdata(ymin:ymax,xmin:xmax) = tdata(ymin:ymax,xmin:xmax)-fynd;
        star_intt = sum(sum(star_intm));
        star_max = max(max(star_intm));
        idnr = idnr + 1;
        identstars(idnr,1)  = plstars(iS,1);    %azimuth
        identstars(idnr,2)  = plstars(iS,2);    %zenith - elevation
        identstars(idnr,3)  = starpar(1);      %starpos in image(x)
        identstars(idnr,4)  = starpar(2);      %starpos in image(y)
        identstars(idnr,5)  = star_max;        %max count from star
        identstars(idnr,6)  = star_intt;       %total counts from star
        identstars(idnr,7)  = (varv<4);        %good gaussian fit
        identstars(idnr,8)  = (3<varv&varv<7); %wide circular gausian
        identstars(idnr,9)  = plstars(iS,3);    %star index
        identstars(idnr,10) = plstars(iS,4);   %star magnitude
        stars_par(idnr,:)   = starpar;
        clear starpar starmat fynd ;
        
        figure(fig3)
        hold on
        [ua,va] = project_directions(identstars(:,1)',identstars(:,2)',optpar,optmod,size(SkMp.img));
        hold on
        plot(ua,va,'.',...
             'color',SkMp.prefs.cl_st_pt,...
             'markersize',SkMp.prefs.sz_st_pt)
        
      end
      
    end
    
    if ( exist( 'identstars','var' ) )
      
      figure(figtmp)
      tstr = sprintf('  left    done   identified\n%d      %d      %d',imax-iS,iS,size(identstars,1));
      title(tstr)
      
    end
    
    figure(SkMp.figsky)
    try
      delete(h1);
    catch
      % Whatever
    end
  end
  
end

idstarsok = identstars;
close(figtmp)
disp('')
disp('')
