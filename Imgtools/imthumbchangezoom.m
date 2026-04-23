function imthumbchangezoom()
% IMTHUMBCHANGEZOOM - 
%   

seltype = get(gcf,'SelectionType');
point1 = get(gca,'CurrentPoint'); % button down detection

axZoom = axis;
axD = [diff(axZoom(1:2)),diff(axZoom(3:4))]/2;

switch seltype
 case 'normal'
  axis([point1(1,1)+(1+1/4)*[-1 1]*axD(1),point1(1,2)+(1+1/4)*[-1 1]*axD(2)])
 case 'alt'
  axis([point1(1,1)+1/(1+1/4)*[-1 1]*axD(1),point1(1,2)+1/(1+1/4)*[-1 1]*axD(2)])
 case 'extend'
  axis([point1(1,1)+1*[-1 1]*axD(1),point1(1,2)+1*[-1 1]*axD(2)])
 otherwise
end
