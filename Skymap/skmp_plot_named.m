function h = skmp_plot_named(SkMp,name2find)
% skmp_plot_named - plots named star/plane and return its star_list info
% 
% Calling: 
%  h = skmp_plot_named(SkMp,name2find)
% Input:
%  SkMp - skymap-struct as produced with the skymap function
%  name2find - char array with name of celestial object (stars, moon or
%              planet) to plot. Typically capitalized first character
% Output:
%  h - handle to plot-marker
% 
% See also: skymap

iFound = skmp_find_w_name(SkMp,name2find);

if iFound > 0
  if isempty(SkMp.img)
    disp(SkMp.star_list(iFound))
    if SkMp.star_list(iFound).Zenith > 90
      disp([name2find,' is below the horizon'])
    else
      idx2plot = find(SkMp.star_list(iFound).Bright_Star_Nr == SkMp.infovstars(:,end));
      if ~isempty(idx2plot)
        hold on
        pstar = SkMp.infovstars(idx2plot,:);
        f_h = plot(180/pi*pstar(6)*cos(-pstar(5)),...
                   180/pi*pstar(6)*sin(-pstar(5)),...
                   'mo','linewidth',2);
        hold off
      else
        disp([name2find,' is outside current field-of-view.'])
      end
    end
  else
    pstars = SkMp.plottstars;
    holdison = ishold;
    hold on
    idx2plot = find(SkMp.star_list(iFound).Bright_Star_Nr == pstars(:,end));
    if ~isempty(idx2plot)
      az = pstars(idx2plot,1);
      ze = pstars(idx2plot,2);
      if SkMp.optmod < 0
       [e1,e2,e3] = camera_base(SkMp.optpar.rot(1),SkMp.optpar.rot(2),SkMp.optpar.rot(3));
      else
        if length(SkMp.optpar) > 9
          [e1,e2,e3] = camera_base(SkMp.optpar(3),SkMp.optpar(4),SkMp.optpar(5),SkMp.optpar(10));
        else
          [e1,e2,e3] = camera_base(SkMp.optpar(3),SkMp.optpar(4),SkMp.optpar(5));
        end
      end
      [u,v] = camera_model(az',ze',...
                           e1,e2,e3,...
                           SkMp.optpar,SkMp.optmod,size(SkMp.img));
      plot(u,v,'rh','markersize',10,'linewidth',2)
      plot(u,v,'c.','markersize',12)
    else
      disp([name2find,' is too faint or outside current field-of-view.'])
    end
    if ~holdison
      hold off
    end
  end
end
if nargout
  h = f_h;
end
