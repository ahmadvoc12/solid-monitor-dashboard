'use client';

import { Flex, Text, useColorModeValue } from '@chakra-ui/react';
import { HSeparator } from '@/components/separator/Separator';

export function SidebarBrand() {
  let textColor = useColorModeValue('navy.700', 'white');

  return (
    <Flex alignItems="center" flexDirection="column">
      <Text fontWeight="bold" fontSize="2xl" color={textColor} mt="30px">
        Solid monitor dashboard
      </Text>
      <Text fontWeight="semibold" fontStyle="italic" fontSize="sm" color={textColor} mt="4px" mb="20px">
       Proof of concept
      </Text>
      <HSeparator w="284px" />
    </Flex>
  );
}

export default SidebarBrand;
